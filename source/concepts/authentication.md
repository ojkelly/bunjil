title: Authentication
---

> Authorization: for this request, who is the user

<img alt="Graphic of an ID card" src="/images/16 Employee Tag.svg" class="ux-icon" />


While Bunjil ships with a [powerful PBAC authorization engine](/concepts/authorization.html), it does not come with any authentication logic. Authentication can be a tricky thing to get right, and is typically different depending on the project or organization.

Bunjil provides a single middleware for you to process authentication per request. It's expected that you would also add a `login` mutation to your schema.


## Authentication middleware

The authentication middleware is a `koa` middleware, that runs for every request just before the GraphQL query is processed.

Your middleware should take the `ctx.request` object, determine the currently logged in user (if any) and return information about the user onto the `ctx.user` object.

Bunjil expects a user object of the following shape:

```typescript
type ctx.user = {
  id:    string | null
  roles: string[] // Array of strings
}
```

You can add anything else you may need for [authorization](/concepts/authorization.html) to `ctx.user`, as the `ctx.user` and `ctx.request` are both passed into the GraphQL context object.

### Example
This is an example of a simple authentication callback that uses a server signed `JWT`. The important bit is extracting the `id` and an array of `roles` that we put on the `ctx.user` object.

```typescript
import * as jwt from "jsonwebtoken";
import {
    Bunjil,
    Policy,
    PolicyCondition,
    PolicyEffect,
    AuthenticationMiddleware,
} from "bunjil";


// must be an async function
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
        // Decode out JWT
        // in this example the jwt has a field for userId, and roles
        const decoded: any = jwt.verify(
            ctx.request.header.authorization.replace("Bearer: ", ""),
            jwtSecret,
        );

        // Add that to ctx.user
        ctx.user = {
            ...decoded,
        };
    }

    // hand off to the next koa middleware
    // this is required
    await next();
};

// Now we need to pass the authenitcation Middleware to Bunjil before it starts
const bunjil: Bunjil = new Bunjil({
    server: {
        hostname: `example.com`,
        // In production you should have a load balancer terminating https for you
        protocol: `http`,
        port: 80,
        tracing: true,
        cacheControl: true,
    },
    playgroundOptions: {
        enabled: false,
    },
    debug: false,
    endpoints:{
      graphQL: "/graphql",
      subscriptions: "/graphql/subscriptions",
      playground: "/playground",
    },
    // Here is where we add the authentication callback
    hooks: {
        authentication: authenticationMiddleware,
    },
});

```

### Guides
*(To be written, soon)*

  -  How to use simple jwt login
  -  How to integrate with Auth0
  -  How to use passport.js