import { Bunjil, Policy, PolicyCondition, PolicyEffect } from "bunjil";
import {
    mockServer,
    MockList,
    makeExecutableSchema,
    addMockFunctionsToSchema,
} from "graphql-tools";
import * as faker from "faker";
import { GraphQLSchema } from "graphql";
import * as url from "url";
import * as Cors from "koa-cors";
import {
    getGraphQLProjectConfig,
    GraphQLProjectConfig,
    GraphQLEndpoint,
} from "graphql-config";

import { authenticationMiddleware } from "./authentication/authenticationMiddleware";
import { resolvers } from "./resolvers/";
import { config } from "./config";
import { policies } from "./policies";

// --[ Init ]--------------------------------------------------------------------------------------

/**
 * Our main function, this sets up the Bunjil instance, and then starts it
 */
async function server() {
    try {
        const env: string = process.env.NODE_ENV
            ? process.env.NODE_ENV
            : "production";
        const config: GraphQLProjectConfig = getGraphQLProjectConfig(
            "../../.graphqlconfig.yml",
            "server",
        );
        const typeDefs: string = config.getSchemaSDL();

        if (
            typeof config.extensions.endpoints === "undefined" ||
            typeof config.extensions.endpoints[env] === "undefined"
        ) {
            throw new Error(
                "FATAL: Cannot start, you need to configure environment.yml to had config.extensions.endpoints",
            );
        }
        const configEndpoints: any = config.extensions.endpoints[env];

        const graphqlEndpoint = url.parse(configEndpoints.url);

        const schema = makeExecutableSchema({
            typeDefs,
            resolvers,
        });

        const endpoints = {
            graphQL: "/graphql",
            subscriptions: "/graphql/subscriptions",
            playground: "/playground",
        };

        const bunjil: Bunjil = new Bunjil({
            server: {
                port: Number(graphqlEndpoint.port),
                tracing: false,
                cacheControl: false,
            },
            debug: true,
            playgroundOptions: {
                enabled: env === "development" ? true : false,
            },
            endpoints: {
                graphQL: graphqlEndpoint.pathname,
                subscriptions: "/graphql/subscriptions",
                playground: "/playground",
            },
            // Policies imported from ./policies
            policies,
            hooks: {
                authentication: authenticationMiddleware,
            },
        });

        bunjil.addSchema({ schemas: [schema] });

        if (process.env.NODE_ENV === "development") {
            // In the dev server set CORS to localhost
            bunjil.koa.use(
                Cors({
                    origin: "*",
                }),
            );
        }

        // Run the bunjil start, but dont bind the server to a port
        bunjil.start();
    } catch (error) {
        console.error(error.message);
        console.error(error.stack);
    }
}

export { server };
