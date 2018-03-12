# Bunjil

[![View on npm](https://img.shields.io/npm/v/bunjil.svg)](https://npmjs.org/packages/bunjil)
[![npm downloads](https://img.shields.io/npm/dm/bunjil.svg)](https://npmjs.org/packages/bunjil)
[![Dependencies](https://img.shields.io/david/ojkelly/bunjil.svg)](https://david-dm.org/ojkelly/bunjil)
[![Build Status](https://travis-ci.org/ojkelly/bunjil.svg?branch=master)](https://travis-ci.org/ojkelly/bunjil)
[![codecov](https://codecov.io/gh/ojkelly/bunjil/branch/master/graph/badge.svg)](https://codecov.io/gh/ojkelly/bunjil)
[![NSP Status](https://nodesecurity.io/orgs/ojkelly/projects/7f441bdb-76ab-4155-aec9-00777b5adc9a/badge)](https://nodesecurity.io/orgs/ojkelly/projects/7f441bdb-76ab-4155-aec9-00777b5adc9a)[![Known Vulnerabilities](https://snyk.io/test/npm/bunjil/badge.svg)](https://snyk.io/test/npm/bunjil)
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fojkelly%2Fbunjil.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2Fojkelly%2Fbunjil?ref=badge_shield)

Bunjil is a public facing GraphQL server.

It comes with Policy Based authorization, and hook for your own authentication (Passport.js, Auth0, database).

It’s purpose is to allow the stitching of one or more private GraphQL Schemas into a public one.

## Getting Started

Documentation coming real soon.

# Roadmap

*   [ ] Documentation
*   [x] Merge multiple GraphQL schemas into one public schema
*   [ ] Ability to hide Types
*   [ ] Ability to hide fields (masking)
*   [x] Policy based authorization down to the field/edge level
*   [x] Ability to deny access to fields based on roles with a policy
*   [ ] Caching, and caching policies down to the field level
*   [x] Authentication hook
*   [x] Authorization hook

## License

## Getting Started

`yarn add bunjil`

`npm install bunjil`

### Usage

## Running the tests

Use `yarn tests` or `npm run tests`.

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
