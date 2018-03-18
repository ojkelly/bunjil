title: Policy Reference
---

A `Policy` is a JSON object describing a single authorization case. Multiple policies are used together to form a functional authorization engine.

More information on [how to use Policies](#), and some [example policies to get you started](#).

Policies are added at runtime and at this stage cannot be altered without restarting the server. The expectation is that policies would be stored in version control next to your server, and when you update the policies, you will redeploy your server.

>Policies with explicit denies (any policy that has `deny` as the `effect`) superseed any other policy. Therefore a policy with `deny` is a hard stop for access, no other policy can ever grant access to that role.


## Policy

Every policy needs a unique ID. This is intended for tracing back the results of an authorization event to the policy that decided the outcome.

|Property|Type|Description|
|---|---|---|
|`id`|`string`|A unique string describing this policy.|
|`effect`|`PolicyEffect` or `string`|One of `PolicyEffect.Allow` or `PolicyEffect.Deny` or just a string of `Allow` or `Deny`.|
|`denyType?`|`string`| Returned to the client with `PolicyEffect.Deny`, for example `mfa-required`.|
|`actions`|Array of `string`|One or more of `query`, `mutation`, `subscription`.|
|`resources`|Array of `string`|See [resources](#Resources)|
|`roles`|Array of `string`|An array of roles, see [roles](#Roles)|
|`conditions`|Array of `PolicyCondition`|See [conditions](#Conditions)|

### Resources

A **resource** is a string representation of the current resolver from the root of the GraphQL schema.

The top level type is seperated by two colons `::` and all subsequent types are seperated by one
colon `:`.

If you take the following schema:

```gql
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

type Query {
  author(id: ID): User
  topPosts(limit: Int): [Post]
}
```

And a query of:

```gql
query topPosts {
  topPosts(limit: 10) {
    id
    title
    views
    author {
      id
      name
    }
  }
```

Then the following resources would be checked for policies:

```
Query::topPosts
Post::id
Post::title
Post::views
Post::author
Author::id
Author::name
```

For these resources to be accessible you would need to specify all fields in your resource array for a policy. Or, you can use a wildcard.

#### Wildcards

Instead of entering every field for your resources, you can wildcard the entire type. This saves you needing to update your policies when you add a new field.

So for above, we could intead use the following resources: `Query::*`, `Post::*`, `Author::*`.

It's reccomneded you keep in mind explicit deny polices when using wildcards. You can have two policies one that grants access to an entire type, and another that explicity denys a specific field, to allow a role access to all but a specific field on that type.

### Roles

A **role** is a string defined on `context.user.roles` which is populated by your authentication function. The default role for a user is `anonymous`.

You can also use wildcards with roles, but they need to be specified as a role in the array. For example `roles: ["*"]` is a wildcard for all roles. And `roles: ["admin-*"]` is a wildcard for all roles starting with `admin-`.

### Conditions

**Conditions** let you fine tune your policy. For example you may only apply a policy to users of a certain IP range, or a time since their session started.

**Condition**

|Property|Type|Description|
|---|---|---|
|`field`|`string`|A dot path to the `key` of the context object to compare, eg `context.request.ip`.|
|`expected`<br> _(optional)_|Array of `number` or <br> Array of `string`|An array of expected values |
|`expectedOnContext`<br> _(optional)_|Array of `string`| A dot path to the context object|
|`operator`|`PolicyOperator`| One of `match`, `notMatch`, `lessThan`, `greaterThan`|

> You must pass either `expected` or `expectedOnContext` if you are adding a condition to a policy.

#### The `context` object

Both `field` and `expectedOnContext` refer to a `context` object that is passed by Bunjil on every authorization check.

The context object is constructed as follows:

```typescript
const context: any = {
    // We destructure(expand) the GraphQL resolver `context` object
    ...context,

    // If no user was added during authentication (for example if auth failed)
    // then a default anonymous user is added with an id of `null` and a role
    // of `anonymous user`
    user: {
      id: 'string',
      roles: ["an array", "of strings", "authenticated user"]
    }

    // We also add the GraphQL resolver `root` object
    root,

    // We also add the GraphQL request `args` object
    args,
},
```

You can use `expectedOnContext` to compare against anything else on the `context` object.


#### Evaluation Process

If there are multiple `conditions` they are evaluated with a boolean `AND`. Which is to say all conditions must be `true` for the policy to evaluate to `true`.

If there are multiple `expectedValues` or `expectedValuesOnContext` on a condition, they are evaluated with a boolean `OR`. Which is to say, if any of the values match, then the condition outcome is true.

#### Expected Values

**expected**
If you are passing an array of `expected` values, it must be an array of `strings`, or an array of `numbers`. It cannot be a mix.

If you pass `numbers` then `operator` must be either a numeric operator `PolicyOperator.lessThan` `PolicyOperator.greaterThan`. If your value is a number passed as a string, it's coerced into a `number`.

If you pass `string` then `operator` must be either a string operator `PolicyOperator.match` `PolicyOperator.notMatch`.

**expectedOnContext**
This must be a dot path to another value on the context object to compare the `field` with.
