title: Getting Started with Bunjil
---

It doesn't take long to get setup with Bunjil, but you will need at least 10 minutes. If you want, there will be an example repo linked here soon you can clone.

[If you're not using Typescript, here is the Javascript Getting Started](/docs/getting-started-js.md).

Bunjil is designed to be a bastion GraphQL server. Meaning it's intended to be public facing, and must handle **authentication** and **authorization**.

With authentication we take the opinion, that you should be able to bring your own. So Bunjil has very few opinions on how authentication should be handled. All you need to do is provide a hook that can decode something on the incoming `Koa.Request` and populate a user object. This can be as simple as decoding a `JWT`, or quering a session storage backend.

Authorization is a bit different however. For it to work you need to provide roles in the form of  an array of strings on the user object.

For example: `user.roles = [ 'authenticated user', 'editor' ]`, would work.

The authorization engine in power by another module called `wahn`. It's a general purpose Policy Based Access Control library. It was written for Bunjil, and has been implemented to suit the nature of GraphQL.


## Setup

```typescript
// Import Bunjil and the Policy Types
import { Bunjil, Policy, PolicyCondition, PolicyEffect } from "bunjil";

// Create a schema

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

// Resolvers are not shown in this example.
const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

// Create a simple policy allowing public access to the data
const policies: Policy[] = [
    {
        id: 'public:read-all',
        resources: ["Query::topPosts", "Post::*", "User::*"],
        actions: ["query"],
        effect: PolicyEffect.Allow,
        roles: ["*"],
    },
    {   // Explicitly deny access to the password field.
        // This will superseed any other policy
        id: 'deny:user::password',
        resources: ["User::password"],
        actions: ["query"],
        effect: PolicyEffect.Deny,
        roles: ["*"],
    },
];

// Create our bunjil server
const bunjil: Bunjil = new Bunjil({
    // Server config
    server: {
        hostname: `localhost`,
        protocol: `http`,
        port: 3000,
        tracing: true,
        cacheControl: true,
    },
    // Optionally in DEV you can enable the GraphQL playground
    playgroundOptions: {
        enabled: false,
    },
    // Set the endpoints where GraphQL is available at
    endpoints: {
        graphQL: "/graphql",
        subscriptions: "/graphql/subscriptions",
        playground: "/playground",
    },
    policies,
});

// Add our schema to the Bunjil instance
bunjil.addSchema({ schemas: [schema] });

// Now start Bunjil
await bunjil.start();
```

And that's it. You now have a very simple Bunjil server.

Next read about adding Authentication.