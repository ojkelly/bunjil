title: Login Policies
---

If you're following the standard method for login show [in the Auth0 guide](/guides/auth0.html), the following policies will allow access for your users to login.

Using the same example schema as in the [Example Polices guide](/guides/example-policies.html):


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

The following is the minimum required to allow your anonymous users to login:

```typescript
import {
  Policy,
  PolicyEffect
} from "bunjil";

const policies: Policy[] = [
    // For authentication to work, you must allow both
    // the mutation for login, and the login response
    // to be accessible by anonymous users.
    {
        id: "Allow Anonymous Login",
        resources: [
            "Mutation::authenticateUser",
            "AuthenticationResponse::*",
            "User::*",
        ],
        actions: ["mutation"],
        effect: PolicyEffect.Allow,
        roles: ["*"],
    },
];

export { policies };
```