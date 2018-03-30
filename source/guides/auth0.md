title: Bunjil with Auth0 Authentication Guide
---

[Example Code](https://github.com/ojkelly/bunjil/master/examples/auth0)

To integrate Bunjil with Auth0 there's two main steps that need to be done. You need to add a `Mutation` to check the Auth0 JWT, and return a `AuthenticationResponse`.

However a production ready integration should have a few more things. Such as automatically downloading the Auth0 keys before the server starts. You can find this in the [Auth0 example code](https://github.com/ojkelly/bunjil/master/examples/auth0).

## Schema

> See [examples/auth0/graphql/schema.graphql](https://github.com/ojkelly/bunjil/blob/master/examples/auth0/graphql/schema.graphql)

This first thing you need is to update your schema to have the following:

```GraphQL
type Mutation {
    authenticateUser(idToken: String): AuthenticationResponse
}

type AuthenticationResponse {
    token: String
    user: User
}
```

This adds a mutation `authenticateUser` (which also needs a resolver), and a `Type` for the `AuthenticationResponse` token.

**Token**

What the token is, ultimately is up to you. It could be a JWT or a session token.

Whatever you choose, you need to be able to verify it, and conver it back to a `User` in the `authenticationMiddleware`, which you will see below.

## Resolver

> See [examples/auth0/src/resolvers/mutation/authenticateUser.ts](https://github.com/ojkelly/bunjil/blob/master/examples/auth0/src/resolvers/mutation/authenticateUser.ts)

The [full code](https://github.com/ojkelly/bunjil/blob/master/examples/auth0/src/resolvers/mutation/authenticateUser.ts) for the `authenticateUser` resolver can be [found here](https://github.com/ojkelly/bunjil/blob/master/examples/auth0/src/resolvers/mutation/authenticateUser.ts).

In general the purpose of the resolver is to take the `idToken` which is the argument passed to it, and verify it can from Auth0.

Once that's done, you can do any business logic you need. For example creating a new user in your database, recording the login in your audit system, and so on.

Finally, you need to return the `AuthenticationResponse`. This needs to contain the token we mentioned above, and it's often useful to return a full `User` object too.

In the Auth0 example code, we are returning a JWT with a shared server secret.

## Authentication Middleware

> See [examples/auth0/src/authentication/authenticationMiddleware.ts](https://github.com/ojkelly/bunjil/blob/master/examples/auth0/src/authentication/authenticationMiddleware.ts)

The `authenticationMiddleware` is the component that converts the token you sent in the `AuthenticationResponse` back into a `User` with `roles` that you can then use in your resolvers, and more importantly in your Authorization Policies.

The [example code for the Auth0](https://github.com/ojkelly/bunjil/blob/master/examples/auth0/src/authentication/authenticationMiddleware.ts) `authenticationMiddleware` first verifies the `token` JWT is valid, and then uses it to extract the user `id` and `roles`.

Finally the extracted user is added to `ctx.user` making it availabe for both Authorization and our resolvers.