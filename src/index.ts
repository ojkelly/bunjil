import { GraphQLSchema, GraphQLNamedType } from "graphQL";
import { Prisma, extractFragmentReplacements, forwardTo } from "prisma-binding";
import { FragmentReplacements } from "graphql-binding/dist/types";
import { GraphQLOptions } from "apollo-server-core";
import * as koaCompress from "koa-compress";
import { addMiddleware } from "graphql-add-middleware";
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
import { GraphQLConfigData } from "graphQL-config";

interface OnTypeConflictCallback {
    (left: GraphQLNamedType, right: GraphQLNamedType): GraphQLNamedType;
}

type playgroundOptions = {
    enabled: boolean;
    endpoint?: string;
    subscriptionsEndpoint?: string;
    htmlTitle?: string;
    workspaceName?: string;
    env?: any;
    config?: GraphQLConfigData;
    settings?: PlaygroundSettings;
};
declare type playgroundTheme = "dark" | "light";
interface PlaygroundSettings {
    ["general.betaUpdates"]: boolean;
    ["editor.theme"]: playgroundTheme;
    ["editor.reuseHeaders"]: boolean;
    ["tracing.hideTracingResponse"]: boolean;
}

type BunjilOptions = {
    // Meta
    debug: boolean;

    playgroundOptions: playgroundOptions;

    // Koa
    server: {
        protocol: string;
        hostname: string;
        port: number;
        tracing?: boolean | undefined;
        cacheControl?: boolean | undefined;
    };

    // GraphQL
    endpoints: {
        graphQL: string | undefined;
        subscriptions: string | undefined;
        playground: string | undefined;
    };

    hooks?: {
        authenticationCallback: AuthenticationCallback;
        authorizationCallback: AuthorizationCallback;
        sanizationCallback: SantizationCallback<any>;
    };
};

interface AuthenticationCallback {
    (args: any, info: any, context: any): Error | void;
}

type AuthorizationCallbackOptions = {
    operation: string;
    resource: string;
    context: any;
};
interface AuthorizationCallback {
    (AuthorizationCallbackOptions): Error | boolean;
}
type SantizationCallbackOptions<Value> = {
    resource: string;
    field: string;
    value: Value;
    context: any;
    returnType: any;
};
interface SantizationCallback<Value> {
    (SantizationCallbackOptions): any;
}

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
    private debug: boolean | undefined;
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
        port: number;
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

    // [ Constructor ]--------------------------------------------------------------------------

    /**
     * Create a new Bunjil instance
     * @param options
     */
    constructor(options: BunjilOptions) {
        this.debug = options.debug;
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
            port: Number(options.server.port),
            tracing:
                typeof options.server.tracing === "boolean"
                    ? options.server.tracing
                    : false,
            cacheControl:
                typeof options.server.cacheControl === "boolean"
                    ? options.server.cacheControl
                    : false,
        };

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

        if (
            context.authorizationCallback(
                info.operation.operation,
                resource,
                context,
            )
        ) {
            // you can modify root, args, context, info
            const result: Promise<any> = await next();

            return context.sanitizationCallback({
                resource,
                field: info.fieldName,
                value: result,
                context,
                returnType: info.returnType,
            });
        }
        return null;
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
        addMiddleware(this.graphQL.schema, this.resolverHook);
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
                    authorizationCallback: this.authorizationCallback,
                    sanitizationCallback: this.sanitizationCallback,
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
    public async start(callback: any): Promise<void> {
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
        this.koa.listen(
            this.serverConfig.port,
            this.serverConfig.hostname,
            callback,
        );
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
        schemas: Array<GraphQLSchema | string>;
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

        let schemasToMerge: Array<GraphQLSchema | string>;
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
        // console.log("authenticationCallback");
        context.user = {
            id: "cjdbhy691001701374eywgoh6",
            roles: ["authenticated user"],
        };

        if (!context.user) {
            return new Error("Not authenticated");
        }
    }
    public authorizationCallback({
        operation,
        resource,
        context,
    }: AuthorizationCallbackOptions): Error | boolean {
        // console.log("authorizationCallback", operation, resource);
        return true;
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
        resource,
        field,
        value,
        context,
        returnType,
    }: SantizationCallbackOptions<Value>): Value | null {
        // console.log({
        //     type: "sanitizationCallback",
        //     resource,
        //     field,
        //     value,
        //     context,
        //     returnType,
        // });

        return value;
    }
}

export {
    Bunjil,
    BunjilOptions,
    AuthenticationCallback,
    AuthorizationCallback,
    playgroundOptions,
    playgroundTheme,
    PlaygroundSettings,
};

function isType(type: string, name: string, value: any): boolean | TypeError {
    if (typeof value === type) {
        return true;
    }
    throw new TypeError(`${name} is not of type '${type}'`);
}
