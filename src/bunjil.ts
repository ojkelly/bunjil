import { GraphQLSchema, GraphQLNamedType, GraphQLError } from "graphQL";
import { GraphQLConfigData } from "graphQL-config";
import { Prisma, extractFragmentReplacements, forwardTo } from "prisma-binding";
import { FragmentReplacements } from "graphql-binding/dist/types";
import { GraphQLOptions } from "apollo-server-core";
import * as koaCompress from "koa-compress";
import { addMiddleware } from "graphql-add-middleware";
import * as cache from "memory-cache";
import * as debug from "debug";

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
import KoaPlaygroundMiddleware from "graphQL-playground-middleware-koa";
import * as winston from "winston";
import { Wahn } from "wahn";

import { ResolverError, AuthorizationError } from "./errors";
import { graphqlKoa } from "./middleware/graphql";

import { isType } from "./utils";
import {
    BunjilOptions,
    AuthenticationCallback,
    AuthorizationCallback,
    AuthorizationCallbackOptions,
    playgroundOptions,
    playgroundTheme,
    PlaygroundSettings,
    Policy,
    PolicyEffect,
    PolicyCondition,
    OnTypeConflictCallback,
} from "./types";

const info: debug.IDebugger = debug("bunjil:info");
const log: debug.IDebugger = debug("bunjil:log");
const warn: debug.IDebugger = debug("bunjil:warn");

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
            if (typeof options.hooks.authentication === "function") {
                this.authenticationCallback = options.hooks.authentication;
            }
            if (typeof options.hooks.authorization === "function") {
                this.authorizationCallback = options.hooks.authorization;
            }
        }

        // Access Control
        if (Array.isArray(options.policies)) {
            this.wahn = new Wahn({
                policies: options.policies,
            });
        }
    }

    /**
     * Every resolver added to Bunjil is wrapped by this hook.
     * This allows up to inject an authorization callback beforehand.
     * The authentication callback is processed at the start of the request,
     * bbut not here.
     *
     * @param root
     * @param args
     * @param context
     * @param info
     * @param next
     */
    private async resolverHook(
        root: any,
        args: any,
        context: any,
        info: any,
        next: any,
    ): Promise<any> {
        log("resolverHook", {
            root,
            args,
            context,
            info,
        });

        // construct an Resource name
        let resource: string = `${info.parentType.name}:`;
        resource = `${resource}:${info.fieldName}`;

        // Get the action name
        const action: string = info.operation.operation;

        // Attemp to authorize this resolver
        try {
            const authorization: boolean = this.authorizationCallback({
                action,
                resource,
                context,
            });

            if (authorization === true) {
                // By awaiting next here we are passing execution to the resolver hook defined
                // by the server at runtime
                const result: Promise<any> = await next();
            }
            throw new AuthorizationError("Access Denied");
        } catch (err) {
            if (this.debug) {
                debug(`bunjil::resolverHook: ${err.message}, ${err.stack}`);
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
        // addSchemaLevelResolveFunction(
        //     this.graphQL.schema,
        // );

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
            // Set the default anonymous user
            // Before we run any authentication middleware we need to set the default user
            // to anonymous. This lets you set a policy with the role `anonymous` to access
            // things like your login mutation, or public resources.
            async (ctx: Koa.Context, next: Function) => {
                ctx.user = { id: null, roles: ["anonymous"] };
                await next();
            },
            // Now we run the authentication middleware
            // This should check for something like an Authentication header, and
            // if it can populate ctx.user with at least an id and an array of roles
            this.authenticationCallback.bind(this),
            // And now we run the actual graphQL query
            // In each resolver we run the authorization callback, against the data we just
            // added to ctx.user
            graphqlKoa({
                schema: this.graphQL.schema,
                debug: this.debug,
                tracing: this.serverConfig.tracing,
                context: {
                    ...this.graphQL.context,
                },
            }),
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
     *
     * In normal use, this function will never be called, as you should provide your own
     * authentication callback, that integrates with your authentication provider.
     *
     * @param args
     * @param info
     * @param context
     */
    public async authenticationCallback(
        ctx: Koa.Context,
        next: () => Promise<any>,
    ): Promise<any> {
        debug(`authenticationCallback: ${JSON.stringify(ctx)}`);
        // Set a default user on the context
        // Bunjil's policy setup expects a user on context with at least, id and an array of roles
        ctx.user = {
            id: null, // anonymous user has null id
            roles: ["anonymous"], // only one role for anonymous user
        };
        await next();
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
        try {
            if (this.wahn instanceof Wahn) {
                const authorization: boolean = this.wahn.evaluateAccess({
                    context,
                    action,
                    resource,
                });
                if (this.debug) {
                    debug(
                        JSON.stringify({
                            type: "authorizationCallback",
                            action,
                            resource,
                            authorization,
                            user: context.user,
                        }),
                    );
                }
                return authorization;
            }
            throw Error("Error: no policies.");
        } catch (err) {
            warn(err.message);
            throw err;
        }
    }
}

export { Bunjil, BunjilOptions };
