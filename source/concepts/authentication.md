title: Authentication
---

> Authorization: for this request, who is the user

While Bunjil ships with a powerful PBAC authorization engine, it does not come with any authentication logic. Authentication can be a tricky thing to get right, and is typically different depending on the project or organization.

Bunjil provides a single middleware for you to process authentication per request. It's expected that you would also add a `login` mutation to your schema.


## Authentication middleware

The authentication middleware is a `koa` middleware, that runs just before the GraphQL query is processed.

**Your middleware should take the `ctx.request` object, determine the currently logged in user (if any) and return information about the user onto the `ctx.user` object.

Bunjil expects a user object of the following shape:

```typescript
type ctx.user = {
  id:    string | null
  roles: string[] // Array of strings
}
```

You can add anything else you may need for [authorization](/concepts/authorization), as the `ctx.user` and `ctx.request` are both passed into the GraphQL context object.

### Guides
*(To be written, soon)*

  -  How to use simple jwt login
  -  How to integrate with Auth0
  -  How to use passport.js