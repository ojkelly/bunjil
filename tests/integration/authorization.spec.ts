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
import * as jwt from "jsonwebtoken";

import {
    Bunjil,
    Policy,
    PolicyEffect,
    PolicyOperator,
    PolicyCondition,
    AuthenticationMiddleware,
} from "../../src/index";

test("Can authenticate, and run authorized query", async t => {
    const topPostsLimit: number = 10;
    // This is a test, so security is not really an issue
    // But dont do this in production, use a real random secret
    const jwtSecret = faker.random.uuid();

    const typeDefs: string = `
    type User {
      id: ID
      name: String
      email: String
      password: String
      roles: [String]
      posts(limit: Int): [Post]
    }

    type Post {
      id: ID
      title: String
      views: Int
      author: User
    }

    type LoginResponse {
      token: String
    }

    type Query {
      author(id: ID): User
      topPosts(limit: Int): [Post]
    }
    type Mutation {
      login(email: String, password: String): LoginResponse
    }
  `;

    const userId: string = faker.random.uuid();
    const name: string = faker.name.findName();
    const email: string = faker.internet.email();
    const password: string = faker.internet.password();
    const roles: string[] = [faker.commerce.department()];
    const issuer: string = "BunjilTest";

    const schema = makeExecutableSchema({ typeDefs });
    addMockFunctionsToSchema({
        schema,
        mocks: {
            Query: () => ({
                topPosts: () => new MockList(topPostsLimit),
            }),
            Mutation: () => ({
                // This is a psuedo login function
                login: (root: any, args: any, context: any, info: any) => {
                    if (args.email === email && args.password === password) {
                        return {
                            // return the jwt in the token field
                            token: jwt.sign(
                                { email, roles, name, userId },
                                jwtSecret, // sign the jwt with our jwt secret
                                {
                                    issuer,
                                },
                            ),
                        };
                    }
                },
            }),
            User: () => ({
                id: userId,
                name,
                email,
                password,
                roles,
            }),
        },
    });

    // This is an example of a simple authentication callback that uses a server signed JWT
    // The important bit is extracting the `id` and an array of `roles` that we put on the
    // ctx.user object.
    const authenticationMiddleware: AuthenticationMiddleware = async (
        ctx: Koa.Context,
        next: () => Promise<any>,
    ): Promise<any> => {
        // Check the Authentication header for a Bearer token
        if (
            ctx &&
            ctx.request &&
            ctx.request.header &&
            ctx.request.header.authorization
        ) {
            // If there is a token, decode it
            const decoded: any = jwt.verify(
                ctx.request.header.authorization.replace("Bearer: ", ""),
                jwtSecret,
                {
                    issuer,
                },
            );
            // Add that to ctx.user
            ctx.user = {
                ...decoded,
            };
        }

        // hand off to the next
        await next();
    };

    const policies: Policy[] = [
        {
            // Allow access to fields only by authenticated users
            id: faker.random.uuid(),
            resources: [
                "Query::topPosts",
                "Query::author",
                "Post::*",
                "User::*",
            ],
            actions: ["query"],
            effect: PolicyEffect.Allow,
            roles,
        },
        {
            // Allow anyone to login
            id: faker.random.uuid(),
            resources: ["Mutation::login", "LoginResponse::token"],
            actions: ["mutation"],
            effect: PolicyEffect.Allow,
            roles: ["anonymous"],
        },
        {
            // Add explicit deny for the password field
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
            tracing: false,
            cacheControl: false,
        },
        playgroundOptions: {
            enabled: false,
        },
        debug: false,
        endpoints,
        policies,
        // Here is where we add the authentication callback
        hooks: {
            authentication: authenticationMiddleware,
        },
    });

    bunjil.addSchema({ schemas: [schema] });

    // Run the bunjil start, but dont bind the server to a port
    await bunjil.start();

    // Create the server
    const server: any = await request(bunjil.koa.callback());

    // Send a login mutation
    const login = await server.post(endpoints.graphQL).send({
        query: `
          mutation login {
            login(email: "${email}", password: "${password}") {
              token
            }
          }
      `,
    });

    // Test the response of the login request
    t.is(login.status, 200);
    t.notDeepEqual(login.body.data, {
        login: null,
    });
    t.is(login.body.data.errors, undefined);
    if (login.body.data.login) {
        t.true(typeof login.body.data.login.token === "string");
    }

    // Save the auth token
    const authorizationToken: string = login.body.data.login.token;

    // Try an authenticated request
    const topPosts = await server
        .post(endpoints.graphQL)
        .set("Authorization", `Bearer: ${authorizationToken}`)
        .send({
            query: `
            query topPosts {
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
    t.is(topPosts.status, 200);
    t.notDeepEqual(topPosts.body.data, {
        topPosts: null,
    });
    t.is(topPosts.body.data.errors, undefined);
    if (topPosts.body.data.topPosts) {
        t.is(topPosts.body.data.topPosts.length, topPostsLimit);
    }

    // Try a request with a field that has been explicitly denied
    const passwordRequest = await server
        .post(endpoints.graphQL)
        .set("Authorization", `Bearer: ${authorizationToken}`)
        .send({
            query: `
            query author {
              author(id: "${userId}") {
                id
                name
                email
                roles
                password
              }
            }
        `,
        });

    // This query should succeed but password MUST be null
    t.is(passwordRequest.status, 200);
    t.deepEqual(passwordRequest.body.data, {
        author: {
            id: userId,
            name,
            email,
            roles,
            password: null,
        },
    });
});

/**
 * Goal: We would like the capability to make a rule that can restrict access to a Type based on
 * a comparison of the context (ie userId) and the returned information from the resolver
 * (ie, userId on the Post type).
 */
test("Restrict access to a type based on userId", async t => {
    // This is a test, so security is not really an issue
    // But dont do this in production, use a real random secret
    const jwtSecret = faker.random.uuid();

    const typeDefs: string = `
  type User {
    id: ID
    name: String
    email: String
    password: String
    roles: [String]
  }

  type LoginResponse {
    token: String
  }

  type Query {
    User(id: ID): User
  }
  type Mutation {
    login(email: String, password: String): LoginResponse
    updatePassword(id: ID, password: String): User
  }
`;

    // This is our logged in user
    const userId: string = faker.random.uuid();
    const name: string = faker.name.findName();
    const email: string = faker.internet.email();
    const password: string = faker.internet.password();
    const roles: string[] = [faker.commerce.department()];
    const issuer: string = "BunjilTest";

    const schema = makeExecutableSchema({ typeDefs });

    addMockFunctionsToSchema({
        schema,
        mocks: {
            Query: () => ({
                employeeSalary: (employeeId: string) => {},
            }),
            Mutation: () => ({
                // This is a psuedo login function
                login: (root: any, args: any, context: any, info: any) => {
                    if (args.email === email && args.password === password) {
                        return {
                            // return the jwt in the token field
                            token: jwt.sign(
                                { email, roles, name, userId },
                                jwtSecret, // sign the jwt with our jwt secret
                                {
                                    issuer,
                                },
                            ),
                        };
                    }
                },
            }),
            User: (root: any, args: any, context: any, info: any) => {
                // This is just mimicking a database lookup
                if (args.id === userId) {
                    return {
                        id: userId,
                        name,
                        email,
                        password,
                        roles,
                    };
                } else {
                    // This just mimics returning the user that was requested.
                    return {
                        id: args.id,
                        name: faker.name.findName(),
                        email: faker.internet.email(),
                        password: faker.internet.password(),
                        roles: [faker.commerce.department()],
                    };
                }
            },
        },
    });

    const authenticationMiddleware: AuthenticationMiddleware = async (
        ctx: Koa.Context,
        next: () => Promise<any>,
    ): Promise<any> => {
        // Check the Authentication header for a Bearer token
        if (
            ctx &&
            ctx.request &&
            ctx.request.header &&
            ctx.request.header.authorization
        ) {
            // If there is a token, decode it
            const decoded: any = jwt.verify(
                ctx.request.header.authorization.replace("Bearer: ", ""),
                jwtSecret,
                {
                    issuer,
                },
            );
            // Add that to ctx.user
            ctx.user = {
                ...decoded,
            };
        }

        // hand off to the next
        await next();
    };

    const policies: Policy[] = [
        {
            // Allow access to fields only by authenticated users
            id: faker.random.uuid(),
            resources: ["Query::*", "User::*"],
            actions: ["query", "mutation"],
            effect: PolicyEffect.Allow,
            roles,
        },
        {
            // Allow anyone to login
            id: faker.random.uuid(),
            resources: ["Mutation::login", "LoginResponse::token"],
            actions: ["mutation"],
            effect: PolicyEffect.Allow,
            roles: ["anonymous"],
        },
        {
            // Add explicit deny for the password field
            id: faker.random.uuid(),
            resources: ["User::password"],
            actions: ["*"],
            effect: PolicyEffect.Deny,
            roles: ["*"],
        },
        {
            id: faker.random.uuid(),
            resources: ["User::*"],
            actions: ["*"],
            effect: PolicyEffect.Deny,
            roles: ["*"],
            conditions: [
                {
                    field: "user.userId",
                    operator: PolicyOperator.notMatch,
                    expectedOnContext: ["root.id"],
                } as PolicyCondition,
            ],
        },
        {
            id: faker.random.uuid(),
            resources: ["Mutation::updatePassword"],
            actions: ["mutation"],
            effect: PolicyEffect.Allow,
            roles: ["*"],
            conditions: [
                {
                    field: "user.userId",
                    operator: PolicyOperator.match,
                    expectedOnContext: ["args.id"],
                } as PolicyCondition,
            ],
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
        debug: false,
        endpoints,
        policies,
        // Here is where we add the authentication callback
        hooks: {
            authentication: authenticationMiddleware,
        },
    });

    bunjil.addSchema({ schemas: [schema] });

    // Run the bunjil start, but dont bind the server to a port
    await bunjil.start();

    // Create the server
    const server: any = await request(bunjil.koa.callback());

    // Send a login mutation
    const login = await server.post(endpoints.graphQL).send({
        query: `
        mutation login {
          login(email: "${email}", password: "${password}") {
            token
          }
        }
    `,
    });

    // Test the response of the login request
    t.is(login.status, 200);
    t.notDeepEqual(login.body.data, {
        login: null,
    });
    t.is(login.body.data.errors, undefined);
    if (login.body.data.login) {
        t.true(typeof login.body.data.login.token === "string");
    }

    // Save the auth token
    const authorizationToken: string = login.body.data.login.token;

    // Try an authenticated request
    const getCurrentUser = await server
        .post(endpoints.graphQL)
        .set("Authorization", `Bearer: ${authorizationToken}`)
        .send({
            query: `
          query user {
            User(id: "${userId}") {
                id
                name
                email
            }
          }
      `,
        });

    t.is(getCurrentUser.status, 200);
    t.deepEqual(getCurrentUser.body.data, {
        User: {
            id: userId,
            name: name,
            email: email,
        },
    });

    // This should fail
    const getAnotherUser = await server
        .post(endpoints.graphQL)
        .set("Authorization", `Bearer: ${authorizationToken}`)
        .send({
            query: `
          query user {
            User(id: "${faker.random.uuid()}") {
                id
                name
                email
            }
          }
      `,
        });

    t.is(getAnotherUser.status, 200);

    // Update own password
    const updateMyPassword = await server
        .post(endpoints.graphQL)
        .set("Authorization", `Bearer: ${authorizationToken}`)
        .send({
            query: `
              mutation updateMyPassword {
                updatePassword(id: "${userId}", password: "${password}") {
                    id
                    name
                    email
                }
              }
          `,
        });
    t.is(updateMyPassword.status, 200);

    const updateSomeoneElsesPassword = await server
        .post(endpoints.graphQL)
        .set("Authorization", `Bearer: ${authorizationToken}`)
        .send({
            query: `
              mutation updateMyPassword {
                updatePassword(id: "${faker.random.uuid()}", password: "${password}") {
                    id
                    name
                    email
                }
              }
          `,
        });
    t.is(updateSomeoneElsesPassword.status, 200);
});
