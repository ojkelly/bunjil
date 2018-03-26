# Bunjil

[![View on npm](https://img.shields.io/npm/v/bunjil.svg)](https://npmjs.org/packages/bunjil)
[![npm downloads](https://img.shields.io/npm/dm/bunjil.svg)](https://npmjs.org/packages/bunjil)
[![Dependencies](https://img.shields.io/david/ojkelly/bunjil.svg)](https://david-dm.org/ojkelly/bunjil)
[![Build Status](https://travis-ci.org/ojkelly/bunjil.svg?branch=master)](https://travis-ci.org/ojkelly/bunjil)
[![codecov](https://codecov.io/gh/ojkelly/bunjil/branch/master/graph/badge.svg)](https://codecov.io/gh/ojkelly/bunjil)
[![NSP Status](https://nodesecurity.io/orgs/ojkelly/projects/7f441bdb-76ab-4155-aec9-00777b5adc9a/badge)](https://nodesecurity.io/orgs/ojkelly/projects/7f441bdb-76ab-4155-aec9-00777b5adc9a)[![Known Vulnerabilities](https://snyk.io/test/npm/bunjil/badge.svg)](https://snyk.io/test/npm/bunjil)
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fojkelly%2Fbunjil.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2Fojkelly%2Fbunjil?ref=badge_shield)

[bunjil.js.org](https://bunjil.js.org) | [Getting Started](https://bunjil.js.org/docs/getting-started)

Bunjil is a public facing GraphQL server.

It comes with Policy Based authorization, and hook for your own authentication (Passport.js, Auth0, database).

It’s purpose is to allow the stitching of one or more private GraphQL Schemas into a public one.

## Getting Started

Documentation coming real soon.

# Roadmap

*   [in progress] Documentation
*   [x] Merge multiple GraphQL schemas into one public schema
*   [ ] Ability to hide Types
*   [ ] Ability to hide fields (masking)
*   [x] Policy based authorization down to the field/edge level
*   [x] Ability to deny access to fields based on roles with a policy
*   [ ] Caching, and caching policies down to the field level
*   [x] Authentication hook
*   [x] Authorization hook

## Getting Started

`yarn add bunjil`

`npm install bunjil`

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
        id: "public:read-all",
        resources: ["Query::topPosts", "Post::*", "User::*"],
        actions: ["query"],
        effect: PolicyEffect.Allow,
        roles: ["*"],
    },
    {
        // Explicitly deny access to the password field.
        // This will superseed any other policy
        id: "deny:user::password",
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

### Usage

## Running the tests

Use `yarn test` or `npm run test`.

Tests are written with `ava`, and we would strongly like tests with any new functionality.

## Contributing

Please read [CONTRIBUTING.md](https://github.com/ojkelly/bunjil/CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/ojkelly/bunjil/tags).

## Authors

*   **Owen Kelly** - [ojkelly](https://github.com/ojkelly)

## License

[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fojkelly%2Fbunjil.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2Fojkelly%2Fbunjil?ref=badge_large)

This project is licensed under the MIT License - see the [LICENSE.md](https://github.com/ojkelly/bunjil/LICENSE.md) file for details

## Acknowledgments

*   [Behind the name](https://en.wikipedia.org/wiki/Bunjil)
