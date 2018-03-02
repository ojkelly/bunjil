import { GraphQLSchema, GraphQLNamedType, GraphQLError } from "graphQL";
import { GraphQLConfigData } from "graphQL-config";
import { Prisma, extractFragmentReplacements, forwardTo } from "prisma-binding";
import { FragmentReplacements } from "graphql-binding/dist/types";
import { GraphQLOptions } from "apollo-server-core";
import * as koaCompress from "koa-compress";
import { addMiddleware } from "graphql-add-middleware";
import * as cache from "memory-cache";
import {
    mergeSchemas,
    makeExecutableSchema,
    addSchemaLevelResolveFunction,
} from "graphql-tools";
import {
    IResolvers,
    MergeInfo,
    UnitOrList,
} from "graphql-tools/dist/Interfaces";
import * as Koa from "koa";
import * as KoaRouter from "koa-router";
import * as KoaBody from "koa-bodyparser";
import { graphqlKoa, KoaGraphQLOptionsFunction } from "apollo-server-koa";
import KoaPlaygroundMiddleware from "graphQL-playground-middleware-koa";
import * as winston from "winston";
import { Wahn } from "wahn";

import { ResolverError, AuthorizationError } from "./errors";

import { isType } from "./utils";
import {
    BunjilOptions,
    AuthenticationCallback,
    AuthorizationCallback,
    AuthorizationCallbackOptions,
    SantizationCallback,
    SantizationCallbackOptions,
    playgroundOptions,
    playgroundTheme,
    PlaygroundSettings,
    Policy,
    PolicyEffect,
    PolicyCondition,
    OnTypeConflictCallback,
} from "./types";

// Bunjil
// Take an existing schema and resolvers
// Wrap everthing in an authentication and authorization function
// Allow you to replace both typeDefs and resolvers
// You can implement unauth'd resolvers, by overriding them and forwardTo

/**
 * Bunjil
 *
 * A public facing GraphQL server
 *
 * TODO: Add subscriptions
 */
class Bunjil {
    // [ Properties ]--------------------------------------------------------------------------

    // Meta properties
    private debug: boolean = false;
    private logger: winston.LoggerInstance;

    public playgroundOptions: playgroundOptions = {
        enabled: false,
    };

    // Koa Server properties
    public koa: Koa;
    private router: KoaRouter;
    public serverConfig: {
        protocol: string;
        hostname: string;
        port?: number;
        tracing: boolean;
        cacheControl: boolean;
    };
    public endpoints: {
        graphQL: string;
        subscriptions: string | undefined;
        playground: string | undefined;
    };

    // private koaGraphQLOptions: GraphQLOptions | KoaGraphQLOptionsFunction;

    // GraphQL properties

    private graphQL: {
        context: any;
        typeDefs: string | undefined;
        schema: GraphQLSchema | undefined;
        resolvers: {
            Query: any;
            Mutation: any;
            Subscription: any;
        };
    };

    private wahn: Wahn | undefined;

    // [ Constructor ]--------------------------------------------------------------------------

    /**
     * Create a new Bunjil instance
     * @param options
     */
    constructor(options: BunjilOptions) {
        if (options.debug) {
            this.debug = options.debug;
        }
        // Setup Winston as the logger, and only log when Debug enabled
        this.logger = new winston.Logger({
            level: "info",
            transports:
                this.debug === true ? [new winston.transports.Console()] : [],
        });

        this.playgroundOptions = options.playgroundOptions;
        if (
            typeof options.endpoints !== "undefined" &&
            typeof options.endpoints.graphQL === "string"
        ) {
            this.endpoints = {
                ...options.endpoints,
                graphQL: options.endpoints.graphQL,
            };
        } else {
            throw new Error("options.endpoints.graphQL is required");
        }

        // Put koa somewhere
        this.koa = new Koa();
        this.router = new KoaRouter();

        this.serverConfig = {
            ...options.server,
            protocol: options.server.protocol,
            hostname: options.server.hostname,
            tracing:
                typeof options.server.tracing === "boolean"
                    ? options.server.tracing
                    : false,
            cacheControl:
                typeof options.server.cacheControl === "boolean"
                    ? options.server.cacheControl
                    : false,
        };

        if (options.server.port) {
            this.serverConfig.port = Number(options.server.port);
        }

        // Init the graphQL props
        this.graphQL = {
            context: {},
            typeDefs: undefined,
            schema: undefined,
            resolvers: {
                Query: {},
                Mutation: {},
                Subscription: {},
            },
        };
        if (typeof options.hooks !== "undefined") {
            if (typeof options.hooks.authenticationCallback === "function") {
                this.authenticationCallback =
                    options.hooks.authenticationCallback;
            }
            if (typeof options.hooks.authorizationCallback === "function") {
                this.authorizationCallback =
                    options.hooks.authorizationCallback;
            }
        }

        // Access Control
        if (Array.isArray(options.policies)) {
            this.wahn = new Wahn({
                policies: options.policies,
            });
        }
    }

    private async resolverHook(
        root: any,
        args: any,
        context: any,
        info: any,
        next: any,
    ): Promise<any> {
        // console.dir({ root, args, context, info, next });

        // construct an ACL name
        let resource: string = `${info.parentType.name}:`;
        resource = `${resource}:${info.fieldName}`;
        const action: string = info.operation.operation;

        try {
            const authorization: boolean = this.authorizationCallback({
                action,
                resource,
                context,
            });

            if (authorization === true) {
                // you can modify root, args, context, info
                // By awaiting next here we are passing execution to the resolver hook defined
                // by the server at runtime
                const result: Promise<any> = await next();

                return this.sanitizationCallback({
                    resource,
                    field: info.fieldName,
                    value: result,
                    context,
                    returnType: info.returnType,
                });
            }
            throw new AuthorizationError("Access Denied");
        } catch (err) {
            if (this.debug) {
                console.debug("bunjil::resolverHook:", err.message, err.stack);
            }
            throw err;
        }
    }

    // [ Instatition ]--------------------------------------------------------------------------

    private finaliseResolvers(): void {
        if (typeof this.graphQL.schema === "undefined") {
            throw new Error("Cannot start GraphQL server, schema is undefined");
        }
        // Add the Authentication function to the top level
        addSchemaLevelResolveFunction(
            this.graphQL.schema,
            this.authenticationCallback,
        );

        // Add our resolverHook to every resolver
        addMiddleware(this.graphQL.schema, this.resolverHook.bind(this));
    }
    /**
     * Add our graphQL endpoints to Koa
     */
    private finaliseGraphqlRoutes(): void {
        if (typeof this.graphQL.schema === "undefined") {
            throw new Error("Cannot start GraphQL server, schema is undefined");
        }

        this.finaliseResolvers();

        // Add the graphql POST route
        this.router.post(
            this.endpoints.graphQL,
            graphqlKoa({
                schema: this.graphQL.schema,
                debug: this.debug,
                tracing: true,
                context: {
                    ...this.graphQL.context,
                    user: {
                        id: "cjdbhy691001701374eywgoh6",
                        roles: ["authenticated user"],
                    },
                },
            }),
            this.sanitizationCallback,
        );

        // Add the graphql GET route
        this.router.get(
            this.endpoints.graphQL,
            graphqlKoa({
                schema: this.graphQL.schema,
                debug: this.debug,
                tracing: true,
            }),
        );

        // Optionally add the playground
        if (this.playgroundOptions.enabled) {
            const playgroundOptions: playgroundOptions = {
                ...this.playgroundOptions,
                endpoint: `${this.serverConfig.protocol}://${
                    this.serverConfig.hostname
                }:${this.serverConfig.port}${this.endpoints.graphQL}`,
            };
            this.router.get(
                this.endpoints.playground,
                KoaPlaygroundMiddleware(playgroundOptions),
            );
        }
    }

    /**
     * Prepare the GraphQL routes, and star the Koa server
     * @param callback
     */
    public async start(): Promise<void> {
        this.koa.on("log", this.logger.info);

        // Add the graphQL routes
        this.finaliseGraphqlRoutes();

        this.koa.use(KoaBody());
        this.koa.use(koaCompress());

        // Finalise the routes for Koa
        this.koa.use(this.router.routes());
        // Finalise the methods for Koa
        this.koa.use(this.router.allowedMethods());
        // Start Koa
        this.koa.listen(this.serverConfig.port, this.serverConfig.hostname);
    }

    public resolveAuthCheck(resolver: any): boolean {
        return true;
    }

    /**
     * Add a resolver that use forwardsTo, and
     * point it to the location in context where
     * it is being forwarded to.
     *
     * @param resolver
     * @param forwardToKey The key passed in via addContext, for where to forward this
     * reoslver to
     */
    private addForwardedResolver(resolver: any, forwardToKey: string): any {
        return forwardTo(forwardToKey);
    }

    // [ Setters ]----------------------------------------------------------------------------------

    /**
     * A special handler to add a schema from Prisma
     *
     * This handler automatically adds prisma to the context, and
     * sets up the resolvers to forward to it
     */
    public addPrismaSchema({
        typeDefs,
        prisma,
        contextKey,
    }: {
        typeDefs: string;
        prisma: Prisma | any;
        contextKey?: string | undefined;
    }): void {
        // Defensively setup the context key
        let prismaContextKey: string = "prisma";
        if (typeof contextKey === "string") {
            prismaContextKey = contextKey;
        }

        // Loop through the resolvers, and wrap them with our forwarding
        // call
        const queryResolvers: any = Object.keys(prisma.query).reduce(
            (accumulator: any, current: any) => {
                accumulator[current] = this.addForwardedResolver(
                    current,
                    prismaContextKey,
                );
                return accumulator;
            },
            {},
        );
        const mutationResolvers: any = Object.keys(prisma.mutation).reduce(
            (accumulator: any, current: any) => {
                accumulator[current] = this.addForwardedResolver(
                    current,
                    prismaContextKey,
                );
                return accumulator;
            },
            {},
        );
        const subscriptionResolvers: any = Object.keys(
            prisma.subscription,
        ).reduce((accumulator: any, current: any) => {
            accumulator[current] = this.addForwardedResolver(
                current,
                prismaContextKey,
            );
            return accumulator;
        }, {});

        // Spread the resolvers out to a new object
        const resolvers: any = {
            Query: {
                ...queryResolvers,
            },
            Mutation: {
                ...mutationResolvers,
            },
            Subscription: {
                ...subscriptionResolvers,
            },
        };

        // Create an executable schema
        const schema: GraphQLSchema = makeExecutableSchema({
            typeDefs: [typeDefs],
            resolvers,
        });

        // Add the new schema
        this.addSchema({ schemas: [schema] });

        // Add Prisma to the context
        this.addContext(prismaContextKey, prisma);
    }

    /**
     * Merge new schemas with one already existing on the Bunjil instance.
     */
    public addSchema({
        schemas,
        onTypeConflict,
        resolvers,
    }: {
        schemas: (GraphQLSchema | string)[];
        onTypeConflict?: OnTypeConflictCallback | undefined;
        resolvers?: UnitOrList<
            IResolvers | ((mergeInfo: MergeInfo) => IResolvers)
        >;
    }): void {
        // The default conflict handler will always favour the incoming type over the incumbent.
        // This ensures we always overwrite the existing type with the new one
        let onTypeConflictCallback: OnTypeConflictCallback = (
            left: GraphQLNamedType,
            right: GraphQLNamedType,
        ): GraphQLNamedType => {
            return right;
        };

        // However, sometimes the server many need a different conflict handler, and we allow it
        if (typeof onTypeConflict !== "undefined") {
            onTypeConflictCallback = onTypeConflictCallback;
        }

        let schemasToMerge: (GraphQLSchema | string)[];
        if (typeof this.graphQL.schema === "undefined") {
            this.logger.info("Adding initial schema");
            schemasToMerge = schemas;
        } else {
            this.logger.info("Merging schema");
            schemasToMerge = [this.graphQL.schema, ...schemas];
        }

        // Merge the incumbent schema, with the newly passed schemas, and add them back onto the
        // Bunjil instance
        this.graphQL.schema = mergeSchemas({
            schemas: schemasToMerge,
            onTypeConflict: onTypeConflictCallback,
        });
    }

    /**
     * Add a value to the context object passed into the
     * GraphQL query, at the location of key
     *
     * @param key
     * @param value
     */
    public addContext(key: string, value: any): void {
        this.graphQL.context = {
            ...this.graphQL.context,
            [key]: value,
        };
    }

    // [ Hooks ]----------------------------------------------------------------------------------

    /**
     * Default Authentication Callback
     * @param args
     * @param info
     * @param context
     */
    public authenticationCallback(
        args: any,
        info: any,
        context: any,
    ): Error | void {
        context.user = {
            id: null,
            roles: ["authenticated user"],
        };

        if (!context.user) {
            return new Error("Not authenticated");
        }
    }

    /**
     * Run before a resolver calls upstream, used to verify
     * the current user has access to the field and operation
     *
     * TODO Cache authorization resolves, so we only need to lookup once
     * @param options
     */
    public authorizationCallback({
        action,
        resource,
        context,
    }: AuthorizationCallbackOptions): boolean {
        // console.log("authorizationCallback", action, resource);
        try {
            if (this.wahn instanceof Wahn) {
                const authorization: boolean = this.wahn.evaluateAccess({
                    context,
                    action,
                    resource,
                });
                if (this.debug) {
                    console.debug({
                        type: "authorizationCallback",
                        action,
                        resource,
                        authorization,
                    });
                }
                return authorization;
            }
            throw Error("Error: no policies.");
        } catch (err) {
            console.debug(err.message);
            throw err;
        }
    }

    /**
     * Called after an upstream GraphQL query is run, but before the result
     * is returned back to the user.
     *
     * This function can be used to sanitize fields before they are returned.
     * @param resource
     * @param context
     */
    public sanitizationCallback<Value>({
        context,
        field,
        resource,
        returnType,
        value,
    }: SantizationCallbackOptions<Value>): Value | null {
        // console.log("sna", {
        //     context,
        //     field,
        //     resource,
        //     returnType,
        //     value,
        // });

        // Not implemented yet

        return value;
    }
}

export { Bunjil, BunjilOptions };
