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

test("Can create server with a simple schema, and respond to query", async t => {
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

    const res: any = await request(bunjil.koa.callback())
        .post(endpoints.graphQL)
        .send({
            query: `
              query getTopPosts {
                topPosts(limit: ${topPostsLimit}) {
                  id
                  title
                  views
                  author {
                    id
                    name
                  }
                }
              }
          `,
        });

    t.is(res.status, 200);
    t.notDeepEqual(res.body.data, {
        topPosts: null,
    });
    t.is(res.body.data.errors, undefined);
    t.is(res.body.data.topPosts.length, topPostsLimit);
});

test("Performance of simple query with policy", async t => {
    const numOfTimedFunctionCalls: number = 50000;

    const allowedPerformance: Timings = {
        high: 10,
        low: 0.02,
        average: 0.2,
        percentiles: {
            ninetyNinth: 0.09,
            ninetyFifth: 0.03,
            ninetieth: 0.028,
            tenth: 0.015,
        },
    };
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

    const timings: TimedPerformance = await timeExecution({
        expectedTimings: allowedPerformance,
        numberOfExecutions: numOfTimedFunctionCalls,
        callback: () => {
            const res: any = server
                .post(endpoints.graphQL)
                .send({
                    query: `
                  query getTopPosts {
                    topPosts(limit: ${topPostsLimit}) {
                      id
                      title
                      views
                      author {
                        id
                        name
                      }
                    }
                  }
              `,
                })
                .expect(res => t.is(res.status, 200))
                .expect(res =>
                    t.notDeepEqual(res.body.data, {
                        topPosts: null,
                    }),
                )
                .expect(res => t.is(res.body.data.errors, undefined))
                .expect(res => {
                    if (res.body.data.topPosts) {
                        t.is(res.body.data.topPosts.length, topPostsLimit);
                    }
                });
        },
    });

    t.true(timings.results.passed, `Execution took too long.`);

    if (timings.results.passed === false) {
        console.log(JSON.stringify(timings, null, 4));
    }
});
