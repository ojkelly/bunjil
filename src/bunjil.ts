import { GraphQLSchema, GraphQLNamedType, GraphQLError } from "graphql";
import { GraphQLConfigData } from "graphql-config";
import { Prisma, extractFragmentReplacements, forwardTo } from "prisma-binding";
import { FragmentReplacements } from "graphql-binding/dist/types";
import { GraphQLOptions } from "apollo-server-core";
import * as koaCompress from "koa-compress";
import { addMiddleware } from "graphql-add-middleware";
import * as debug from "debug";
import * as hash from "object-hash";
import { mergeSchemas, makeExecutableSchema } from "graphql-tools";
import {
    IResolvers,
    MergeInfo,
    UnitOrList,
} from "graphql-tools/dist/Interfaces";
import * as Koa from "koa";
import * as KoaRouter from "koa-router";
import * as KoaBody from "koa-bodyparser";
import KoaPlaygroundMiddleware from "graphql-playground-middleware-koa";
import * as winston from "winston";
import { Wahn } from "wahn";

import { ResolverError, AuthorizationError } from "./errors";
import { graphqlKoa } from "./middleware/graphql";

import { Cache } from "./cache";

import { isType } from "./utils";
import {
    BunjilOptions,
    AuthenticationMiddleware,
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

// Setup debugging
const info: debug.IDebugger = debug("bunjil:info");
const log: debug.IDebugger = debug("bunjil:log");
const warn: debug.IDebugger = debug("bunjil:warn");

/**
 * Bunjil
 *
 * A public facing GraphQL server
 *
 * TODO: Add/Test subscriptions
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
        port?: number;
        tracing: boolean;
        cacheControl: boolean;
        disableBunjilCache: boolean;
        useApolloCache: boolean;
        useApolloTracing: boolean;
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

    // Authorization
    private wahn: Wahn | undefined;

    // Caching
    private cache: Cache | undefined;

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

        // Add any plargoundOptions
        this.playgroundOptions = options.playgroundOptions;

        // Add the GraphQL Endpoints
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

        // Initialise Koa and its router
        this.koa = new Koa();
        this.router = new KoaRouter();

        // Setup the serverConfig
        this.serverConfig = {
            ...options.server,
            tracing:
                typeof options.server.tracing === "boolean"
                    ? options.server.tracing
                    : false,
            cacheControl:
                typeof options.server.cacheControl === "boolean"
                    ? options.server.cacheControl
                    : false,
            disableBunjilCache:
                typeof options.server.disableBunjilCache === "boolean"
                    ? options.server.disableBunjilCache
                    : false,
            useApolloCache:
                typeof options.server.useApolloCache === "boolean"
                    ? options.server.useApolloCache
                    : false,
            useApolloTracing:
                typeof options.server.useApolloTracing === "boolean"
                    ? options.server.useApolloTracing
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

        // Check to see if there are any auth* hooks to monkey patch the defaults with
        if (typeof options.hooks !== "undefined") {
            if (typeof options.hooks.authentication === "function") {
                this.authenticationMiddleware = options.hooks.authentication;
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

        // If cacheControl is on, setup a cache.
        if (
            this.serverConfig.cacheControl === true &&
            this.serverConfig.disableBunjilCache === false
        ) {
            this.cache = new Cache();
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
        // log("resolverHook", {
        //     root,
        //     args,
        //     context,
        //     user: context.user,
        //     info,
        //     cacheControl: info.cacheControl,
        // });

        // construct an Resource name
        let resource: string = `${info.parentType.name}:`;
        resource = `${resource}:${info.fieldName}`;

        // Get the action name
        const action: string = info.operation.operation;

        try {
            // Attemp to authorize this resolver
            const authorization: boolean = this.authorizationCallback({
                action,
                resource,
                context: {
                    ...context,
                    root,
                    args,
                },
            });

            if (authorization === true) {
                let cacheKey: string | undefined = undefined;
                let cacheTTL: number | undefined = undefined;
                if (
                    action === "query" &&
                    this.cache &&
                    info &&
                    info.cacheControl &&
                    info.cacheControl.cacheHint &&
                    info.cacheControl.cacheHint.maxAge
                ) {
                    cacheKey = `${hash(resource)}:${hash(args)}`;

                    // If scope is private, scope the cacheKey to this user
                    // only
                    if (
                        info.cacheControl.cacheHint.scope &&
                        info.cacheControl.cacheHint.scope === "PRIVATE" &&
                        context.user.id !== null
                    ) {
                        cacheKey = `${cacheKey}:${context.user.id}`;
                    }

                    cacheTTL = info.cacheControl.cacheHint.maxAge;

                    try {
                        const cachedResult: any | undefined = this.cache.get(
                            cacheKey,
                        );

                        if (typeof cachedResult !== "undefined") {
                            // this is a cache hit
                            return cachedResult;
                        }
                    } catch (cacheErr) {
                        debug(cacheErr);
                    }
                }
                // Hand off to the graphql resolvers
                const result: Promise<any> = await next();

                // If the cache is enabled, cache the result
                if (
                    action === "query" &&
                    this.cache &&
                    typeof cacheKey === "string" &&
                    typeof cacheTTL === "number"
                ) {
                    this.cache.set(cacheKey, result, cacheTTL);
                }

                // And return the result of the query
                return result;
            }
            throw new AuthorizationError("access-denied", "Access Denied");
        } catch (err) {
            if (this.debug) {
                debug(`bunjil::resolverHook: ${err.message}, ${err.stack}`);
            }
            throw new AuthorizationError(
                err.denyType ? err.denyType : "access-denied",
                "Access Denied",
            );
        }
    }

    // [ Instatition ]--------------------------------------------------------------------------

    private finaliseResolvers(): void {
        if (typeof this.graphQL.schema === "undefined") {
            throw new Error("Cannot start GraphQL server, schema is undefined");
        }

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

            this.sanitiseMiddleware.bind(this),
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
            this.authenticationMiddleware.bind(this),

            // And now we run the actual graphQL query
            // In each resolver we run the authorization callback, against the data we just
            // added to ctx.user
            graphqlKoa({
                schema: this.graphQL.schema,
                debug: this.debug,
                // tracing: this.serverConfig.tracing,
                cacheControl: this.serverConfig.cacheControl,
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
                endpoint: this.endpoints.graphQL,
            };
            this.router.get(
                this.endpoints.playground,
                KoaPlaygroundMiddleware(playgroundOptions),
            );
        }
    }

    /**
     * Prepare the GraphQL routes, and star the Koa server
     */
    public async start(): Promise<void> {
        this.koa.on("log", this.logger.info);

        // Add the graphQL routes
        this.logger.debug("Finalising GraphQL routes");
        this.finaliseGraphqlRoutes();

        this.koa.use(KoaBody());
        this.koa.use(koaCompress());

        // Finalise the routes for Koa
        this.koa.use(this.router.routes());
        // Finalise the methods for Koa
        this.koa.use(this.router.allowedMethods());

        this.logger.debug("Starting Koa");
        // Start Koa
        this.koa.listen(this.serverConfig.port);
        this.logger.debug(
            `Bunjil running at port ${this.serverConfig.port}`,
        );
    }

    /**
     * Add a resolver that use forwardsTo, and
     * point it to the location in context where
     * it is being forwarded to.
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
        this.logger.debug("Added Prisma schema");

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
            this.logger.debug("Added initial schema.");
            schemasToMerge = schemas;
        } else {
            this.logger.debug("Merging additional schema.");
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
     */
    public addContext(key: string, value: any): void {
        this.logger.debug(`Added '${key}' to GraphQL context.`);
        this.graphQL.context = {
            ...this.graphQL.context,
            [key]: value,
        };
    }

    // [ Hooks ]----------------------------------------------------------------------------------

    /**
     * Default Authentication Middleware
     *
     * In normal use, this function will never be called, as you should provide your own
     * authentication callback, that integrates with your authentication provider.
     */
    public async authenticationMiddleware(
        ctx: Koa.Context,
        next: () => Promise<any>,
    ): Promise<any> {
        await next();
    }

    /**
     * Run before a resolver calls upstream, used to verify
     * the current user has access to the field and operation
     */
    public authorizationCallback({
        action,
        resource,
        context,
    }: AuthorizationCallbackOptions): boolean {
        log("authorizationCallback", {
            action,
            resource,
            context,
        });

        try {
            if (this.wahn instanceof Wahn) {
                const authorization: boolean = this.wahn.evaluateAccess({
                    context,
                    action,
                    resource,
                });
                if (this.debug) {
                    debug(
                        JSON.stringify(
                            {
                                type: "authorizationCallback",
                                action,
                                resource,
                                authorization,
                                user: context.user,
                                context,
                            },
                            null,
                            4,
                        ),
                    );
                }
                return authorization;
            }
            throw Error("Error: no policies.");
        } catch (err) {
            if (this.debug) {
                warn(err.message, err.stack);
            }
            throw err;
        }
    }

    /**
     * Sanitisation Middleware
     *
     * This is run as the last middleware before the response is returned.
     */
    private async sanitiseMiddleware(
        ctx: any,
        next: () => Promise<any>,
    ): Promise<any> {
        // Wait for the GraphQL query to resolve
        await next();

        // Remove caching and or tracing information if there isn't
        // going to be an Apollo Engine proxy in front
        if (
            this.serverConfig.useApolloCache === false ||
            this.serverConfig.useApolloTracing === false
        ) {
            const body: any = JSON.parse(ctx.response.body);
            const sanitisedBody = {
                data: body.data,
                errors: body.errors,
                extensions: {
                    ...body.extensions,
                    cacheControl: this.serverConfig.useApolloCache
                        ? body.extensions.cacheControl
                        : undefined,
                    tracing: this.serverConfig.useApolloTracing
                        ? body.extensions.tracing
                        : undefined,
                },
            };
            ctx.body = JSON.stringify(sanitisedBody);
        }
    }
}

export { Bunjil, BunjilOptions };
