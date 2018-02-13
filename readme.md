# Bunjil

Bunjil is a public facing GraphQL library/server.

It’s purpose is to allow the stitching of one or more private GraphQL Schemas into a public one.

It allows you to overwrite `Types` to hide fields, overwrite resolvers, add more resolvers.

It runs an Authentication and Authorization callback before processing any `GraphQL` request.

## Getting Started

### 1. Create a `Bunjil` server.

```typescript
import { Bunjil } from "bunjil";

const bunjil: Bunjil = new Bunjil({
    // Server port
    port: 4000,

    // Define your endpoints
    endpoints: {
        graphQL: "/graphql",
        playground: "/playground",
    },

    // Optionally add the GraphQL API playground
    playgroundOptions: {
        enabled: true,
    },
});
```

### 2. Add your types:

First add all of your upstream types, then overwrite any where you need to hide fields.

```typescript
// Define the private type
// This usually comes from your upstream GraphQL server
const privateUserType: String = `
  type User: {
    uuid: ID!
    username: String!
    password: String!
  }
`;

bunjil.addTypes(privateUserType);

// Hide the uuid, and password fields by not including them
const publicUserType: String = `
  type User: {
    username: String!
  }
`;

// Replace the `User` type
bunjil.addTypes(publicUserType);
```

### 3. Add your resolvers:

```typescript
```

### 4. Add you `Authentication` callback:

An authentication callback, is a simple function can be used to determine if the user is currently
logged in.

In this example, `context.request` contains the `request` object from `koa`. And we are verifing,
then extracting the userId from the `jwt` on the `Authorization` header of the request.

```typescript
import * as jwt from "jsonwebtoken";

const authenticateCallback(args, info, context): boolean {
    if (typeof process.env.APP_SECRET === "undefined") {
        throw new Error("[FATAL]: process.env.APP_SECRET is unset");
    }
    const Authorization: string = context.request.get("Authorization");
    if (Authorization) {
        const token: string = Authorization.replace("Bearer ", "");
        const { userId } = jwt.verify(token, process.env.APP_SECRET) as {
            userId: string;
        };
        return userId;
    }
    throw new Error("Not Authorized");
}

bunjil.addAuthenticateCallback(authenticateCallback);
```

### 5. Add your `Authorization` callback:

```typescript
const authorizationCallback(args, info, context): boolean {

}

bunjil.addAuthorizationCallback(authorizationCallback);
```

# ACLs

Bunjil comes with an ACL implementation, but you can override this with your own by replacing the authorizationCallback.
