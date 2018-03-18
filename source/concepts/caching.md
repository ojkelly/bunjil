title: Caching
---

<img alt="Graphic of a cloud and a server with circular arrows" src="/images/13 Cloud Synchronize.svg" class="ux-icon" />

> Bunjil's cache is in beta. It works, but it hasn't had enough production use to understand any edge-cases. If you find one please [file a ticket](https://github.com/ojkelly/bunjil/issues/new).

Bunjil implements resolver level caching, by adhering to the same `cacheControl` directives as [apollo-cache-control](https://www.npmjs.com/package/apollo-cache-control). This give you the flexibility to use either Bunjil's cache, just use Apollo Engine to cache, or both.

This is possible because the underlying GraphQL server implementation is `apollo-server`, which comes with `apollo-cache-control`.

## Schema Directives

### `@cacheControl`

|Argument|Type|Description|
|---|---|---|
|`maxAge`|`number`|Seconds until cache expiration.|
|`SCOPE`|`string`| Either `PUBLIC` or `PRIVATE`. If `PRIVATE` the cache key is scoped to the logged in user.|

```graphql
type Post @cacheControl(maxAge: 240) {
  id: Int!
  title: String
  author: Author
  votes: Int @cacheControl(maxAge: 30)
  readByCurrentUser: Boolean! @cacheControl(scope: PRIVATE)
}
```

## Usage

When you create a new `Bunjil` instance, pass `true` at `server.cacheControl` to enable the internal Bunjil cache.

```typescript
import { Bunjil } from 'bunjil';

const bunjil: Bunjil = new Bunjil({
    server: {
        hostname: `localhost`,
        protocol: `http`,
        port: 80,
        tracing: false,
        // Enable cacheControl directive and Bunjil cache
        cacheControl: true,

        // Disable Bunjil caching. This is useful if you want to enable
        //  only Apollo cache
        disableBunjilCache: false,

        // Optionally use Apollo Cache
        // This prints out caching information with the GraphQL response, which
        // is then consumed by Apollo Engine
        useApolloCache: false,
    },
    playgroundOptions: {
        enabled: false,
    },
    debug: true,
    endpoints,
    policies,
});
```


### Caching Engine

Currently, Bunjil comes with an in-memory cache. The caching part of Bunjil has been written to easily be replaced with a binding to `redis` or `memcached`. These bindings [are on the roadmap](https://github.com/ojkelly/bunjil/issues/19).