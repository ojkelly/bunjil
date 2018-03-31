title: Schema Masking
---
<img alt="Graphic of inteconnected servers" src="/images/03 Cloud Server Network.svg" class="ux-icon" />

It's fundemental to the security model of Bunjil to provide a single public schema. With one schema,
you only need one GraphQL endpoint for your apps, one method for Authentication, and one set of policies
for Authorization.

In short, things get simpler when you have one public schema.

There's a few major use cases for merging multiple schema's into one, inluding masking, multiple upstream
GraphQL servers, and proxying third party API's.

## Masking

While it's possible to use an Authorization policy to block access to a field, it's even better to
remove that field from the public schema entirely. Masking is the pattern of merging in a new `Type`
in your schema that will overwrite an existing schema, and remove a field.

Let's take the following schema as our starting point:

```typescript
const typeDefs: string = `
  type User {
    id: ID
    name: String
    email: String
    password: String
  }

  type Post {
    id: ID
    title: String
    views: Int
    author: User
  }

  type Query {
    User(id: ID): User
    topPosts(limit: Int): [Post]
  }
`;

// make our schema executable
const schema = makeExecutableSchema({
  typeDefs,
  resolvers
});

// Add the schema to Bunjil
bunjil.addSchema({ schemas: [schema] });
```

There's one field there that should under no circumstances be in a public schema, `User.password`.

You could create a policy as follow to prevent access:

```typescript
{
    // Add explicit deny for the password field
    id: "Prevent access to passwords",
    resources: ["User::password"],
    actions: ["query"],
    effect: PolicyEffect.Deny,
    roles: ["*"],
},
```

But the better option is to mask the field entirely:

```typescript
// Define our masking schema
const maskingTypeDefs: string = `
  type User {
    id: ID
    name: String
    email: String
    location: String
  }
  type Query {
    User(id: ID): User
  }

`;

// Make our masking schema executable
const maskingSchema = makeExecutableSchema({
  typeDefs: maskingTypeDefs,
  resolvers,
});

// Add the masking schema
bunjil.addSchema({ schemas: [maskingSchema] });
```

The key points to note is that we added the base schema (which had `User.password`) first, and then
we added our masking schema.

> _By default, Bunjil will always overwrite older types with newer types._

#### Namespaces

You don't need to do the merging inside of Bunjil. As it only needs an executable schema, you can
still use all the community tools avaiable to create the final schema before passing it to Bunjil.

Of note is the `graphql-weaver` [package](https://github.com/AEB-labs/graphql-weaver), that lets you weave together multiple schemas, and namespace them. It's a phenomenal package, that is well worth a look if your schema could
benifit from namespacing.

## OnTypeConflict

Bunjil uses Apollo's `mergeSchema` under the hood, and exposes the `onTypeConflict` callback to you
in case you need more control.

```typescript

// This is what the default Bunjil OnTypeConflict callback looks like.
// All it does is ensure any new type, will overwrite any older type.
let onTypeConflictCallback: OnTypeConflictCallback = (
    left: GraphQLNamedType,
    right: GraphQLNamedType,
): GraphQLNamedType => {
    return right;
};

const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
  onTypeConflict: onTypeConflictCallback,
});
```

You can learn more about schema stiching [here](https://www.apollographql.com/docs/graphql-tools/schema-stitching.html).
