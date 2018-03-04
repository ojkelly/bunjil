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
    PolicyCondition,
    PolicyEffect,
    AuthenticationCallback,
} from "../../src/index";

test.only("Can authenticate, and run authenticated query", async t => {
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
                                jwtSecret, // sign the jwrt with our jwt secret
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
    const authenticationCallback: AuthenticationCallback = async (
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
                "User::id",
                "User::name",
                "User::email",
                // "User::password",
                "User::roles",
                "User::posts",
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
            hostname: `localhost`,
            protocol: `http`,
            tracing: true,
            cacheControl: true,
        },
        playgroundOptions: {
            enabled: false,
        },
        debug: true,
        endpoints,
        policies,
        // Here is where we add the authentication callback
        hooks: {
            authentication: authenticationCallback,
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
    console.log(login.body);

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
    console.log(passwordRequest.body);
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
