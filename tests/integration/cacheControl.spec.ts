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
import "apollo-cache-control";
import * as request from "supertest";
import { timeExecution, TimedPerformance, Timings } from "wedgetail";
import { Bunjil, Policy, PolicyCondition, PolicyEffect } from "../../src/index";

// https://github.com/lirown/graphql-custom-directive

test("Can cache", async t => {
    const topPostsLimit: number = 10;

    const typeDefs: string = `
      type User {
        id: ID
        name: String @cacheControl(maxAge: 30)
        password: String
        posts(limit: Int): [Post]
      }

      type Post {
        id: ID @cacheControl(maxAge: 30)
        title: String @cacheControl(maxAge: 30)
        views: Int @cacheControl(maxAge: 30)
        author: User @cacheControl(maxAge: 30)
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
            hostname: `localhost`,
            protocol: `http`,
            tracing: false,
            cacheControl: true,
        },
        playgroundOptions: {
            enabled: false,
        },
        debug: true,
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

    // console.log(JSON.stringify(res.body, null, 4));

    t.is(res.status, 200);
    t.notDeepEqual(res.body.data, {
        topPosts: null,
    });
    t.is(res.body.data.errors, undefined);
    t.is(res.body.data.topPosts.length, topPostsLimit);
});
