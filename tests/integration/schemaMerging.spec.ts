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

test("Can merge schemas, and mask a type", async t => {
    const topPostsLimit: number = 10;

    const typeDefs: string = `
      type User {
        id: ID
        name: String
        email: String
        password: String
      }

      type Query {
        User(id: ID): User
      }
    `;
    const schema = makeExecutableSchema({ typeDefs });

    addMockFunctionsToSchema({
        schema,
        mocks: {
            Query: () => ({
                User: () => ({
                    id: faker.random.uuid(),
                    name: faker.name.findName(),
                    email: faker.internet.email(),
                    password: faker.internet.password(),
                }),
            }),
        },
    });

    const policies: Policy[] = [
        {
            id: faker.random.uuid(),
            resources: ["Query::User", "User::*"],
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

    const maskingTypeDefs: string = `
      type User {
        id: ID
        name: String
        email: String
      }
      type Query {
        User(id: ID): User
      }

    `;

    const maskingSchema = makeExecutableSchema({ typeDefs: maskingTypeDefs });
    addMockFunctionsToSchema({
        schema: maskingSchema,
        mocks: {
            Query: () => ({
                User: () => ({
                    id: faker.random.uuid(),
                    name: faker.name.findName(),
                    email: faker.internet.email(),
                }),
            }),
        },
    });
    bunjil.addSchema({ schemas: [maskingSchema] });

    // Run the bunjil start, but dont bind the server to a port
    await bunjil.start();

    const res: any = await request(bunjil.koa.callback())
        .post(endpoints.graphQL)
        .send({
            query: `
              query getUser {
                User {
                  id
                  name
                  email
                  password
                }
              }
          `,
        });

    t.is(res.status, 400);
    t.false(
        typeof res !== "undefined" &&
            typeof res.body !== "undefined" &&
            typeof res.body.User !== "undefined" &&
            typeof res.body.data.User.password === "string",
        "Masking failed, password field exists",
    );
});
