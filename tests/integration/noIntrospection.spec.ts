import test from "ava";
import * as faker from "faker";
import * as Koa from "koa";
import * as util from "util";
import {
    mockServer,
    MockList,
    makeExecutableSchema,
    addMockFunctionsToSchema,
} from "graphql-tools";

import * as request from "supertest";
import { timeExecution, TimedPerformance, Timings } from "wedgetail";
import { Bunjil, Policy, PolicyCondition, PolicyEffect } from "../../src/index";

test("Can disable introspection", async t => {
    const topPostsLimit: number = 10;

    const typeDefs: string = `
      type User {
        id: ID
        name: String
        password: String
        posts(limit: Int): [Post]
      }

      type Post {
        id: ID
        title: String
        views: Int
        author: User
      }

      type Query {
        author(id: ID): User
        topPosts(limit: Int): [Post]
      }
    `;
    const schema = makeExecutableSchema({ typeDefs });
    addMockFunctionsToSchema({
        schema,
        mocks: {
            Query: () => ({
                topPosts: () => new MockList(topPostsLimit),
            }),
        },
    });

    const policies: Policy[] = [
        {
            id: faker.random.uuid(),
            resources: ["Query::topPosts", "Post::*", "User::*"],
            actions: ["query"],
            effect: PolicyEffect.Allow,
            roles: ["*"],
        },
    ];

    const endpoints = {
        graphQL: "/graphql",
        subscriptions: "/graphql/subscriptions",
        playground: "/playground",
    };

    const bunjil: Bunjil = new Bunjil({
        server: {
            tracing: false,
            cacheControl: false,
            disableIntrospection: true,
        },
        playgroundOptions: {
            enabled: false,
        },
        endpoints,
        policies,
    });

    bunjil.addSchema({ schemas: [schema] });

    // Run the bunjil start, but dont bind the server to a port
    await bunjil.start();
    const server: any = await request(bunjil.koa.callback());

    // Send a login mutation
    const introspectionQuery = await server.post(endpoints.graphQL).send({
        query: `
        query {
          __schema {
            types {
              name
              kind
              description
              fields {
                name
              }
            }
          }
        }
      `,
    });

    t.is(introspectionQuery.status, 400);
    t.is(introspectionQuery.body.data, undefined);

    t.is(
        introspectionQuery.body.errors[0].message,
        "GraphQL introspection is disabled.",
    );
});
