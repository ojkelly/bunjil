# Bunjil

Bunjil is a public facing GraphQL library/server.

It’s purpose is to allow the stitching of one or more private GraphQL Schemas into a public one.

It allows you to overwrite `Types` to hide fields, overwrite resolvers, add more resolvers.

It runs an Authentication and Authorization callback before processing any `GraphQL` request.

## Getting Started

Documentation coming real soon.

# Roadmap

*   [x] Merge multiple GraphQL schemas into one public schema
*   [ ] Ability to hide Types
*   [ ] Ability to hide fields (masking)
*   [x] Policy based authorization down to the field/edge level
*   [ ] Caching, and caching policies down to the field level
*   [ ] Query sanitization
*   [x] Authentication hook
*   [x] Authorization hook
