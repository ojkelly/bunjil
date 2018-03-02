import test from "ava";
import * as faker from "faker";
import * as Koa from "koa";
import {
    mockServer,
    MockList,
    makeExecutableSchema,
    addMockFunctionsToSchema,
} from "graphql-tools";

import * as request from "supertest";

import { Bunjil, Policy, PolicyCondition, PolicyEffect } from "../../src/index";

test.skip("Can authenticate, and run authenticated query", async t => {
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
    // console.log({ schema });
    const policies: Policy[] = [
        {
            id: faker.random.uuid(),
            resources: ["Query::topPosts", "Post::*", "User::*"],
            actions: ["query"],
            effect: PolicyEffect.Allow,
            roles: ["*"],
        },
        {
            id: faker.random.uuid(),
            resources: ["User::password"],
            actions: ["query"],
            effect: PolicyEffect.Deny,
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
            tracing: true,
            cacheControl: true,
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
            query getUsers {
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
    if (res.body.data.topPosts) {
        t.is(res.body.data.topPosts.length, topPostsLimit);
    }
});
