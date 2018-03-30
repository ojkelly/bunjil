title: Example Policies
---

All the examples on this page are written for the following schema:

```typescript
const typeDefs: string = `
type Query {
    Post(id: ID): Post
    topPosts(limit: Int): [Post]
}

type Mutation {
    authenticateUser(
        idToken: String
    ): AuthenticationResponse
}

type User {
    id: String
    email: String
    givenName: String
    name: String
    password: String
}

type Post {
    id: ID
    title: String
    views: Int
    author: User
}

type AuthenticationResponse {
    token: String
    user: User
}
`;
```


# Grant access to a Type

To allow anonymous users to view `Posts` we first need to allow them to send a `Query` to `Post` (this is distinct from a `Mutation`). And then we need to allow the fields on `Post`, in this case all of them.

```typescript
const policy: Policy = {
    id: "Allow anonymous access to Post",
    resources: [
        "Query::Post",
        "Post::*"
    ],
    actions: ["query"],
    effect: PolicyEffect.Allow,
    roles: ["anonymous user"],
};
```

#### Grant access to a single field on a Type

Sometimes you only want to allow access to certain fields, in this case `title`. **This isn't always the best idea, see the next example for blocking access*.

```typescript
const policy: Policy = {
    id: "Allow anonymous access to Post Title",
    resources: [
        "Query::Post",
        "Post::title"
    ],
    actions: ["query"],
    effect: PolicyEffect.Allow,
    roles: ["anonymous user"],
};
```

#### Grant access to a Type, except for a specific field

The previous example shows how to allow just a specific type, but it doesn't *block* access. You could add another policy that allowed access to `Post::*` and then the role would be able to see everything not just `Post::title`.

If you want to stop a role from accessing a field you need to explicity deny it. Once a field or type has been explicitly denied, no other policy can allow it.

```typescript
const policy: Policy = {
    id: "Deny anonymous access to Post Title",
    resources: [
        "Post::title"
    ],
    actions: ["query"],
    effect: PolicyEffect.Deny,
    roles: ["anonymous user"],
};
```
