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

test("Can create server with a simple schema, and respond to query", async t => {
    const typeDefs: string = `
      type User {
        id: Int
        name: String
        posts(limit: Int): [Post]
      }

      type Post {
        id: Int
        title: String
        views: Int
        author: User
      }

      type Query {
        author(id: Int): User
        topPosts(limit: Int): [Post]
      }
    `;
    const schema = makeExecutableSchema({ typeDefs });
    addMockFunctionsToSchema({ schema });
    // console.log({ schema });
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

    const topPostsLimit: number = 10;
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
    console.debug(res.body.data);
    t.is(res.body.data, {
        topPosts: null,
    });
    t.is(res.status, 200);
});
