title: Bunjil Reference
---


# `Bunjil`

`import { Bunjil } from 'bunjil';`

## constructor

`const bunjil: Bunjil = new Bunjil(options);`

Create a new instance by passing an options object detailed below.

### `options`
|Property|Type|Description|
|---|---|---|
|`debug`|`boolean`|`true` in your dev environment, but **never in production**||
|`server`|||
|`server.protocol`|`string`|Typically either `http` or `https` |
|`server.hostname`|`string`|Probably `localhost` for dev and `example.com` (your actual domain) for production|
|`server.port`|`number`|The port to bind on. _(Technically optional to support unit/integration tests, but you need it in normal use)_.|
|`server.tracing` <br> _(optional)_ <br> Default: `false`|`boolean` `undefined`|`true` if you want to enable tracing on the underlying `apollo-server`|
|`server.cacheControl` <br> _(optional)_ <br> Default: `false`|`boolean` `undefined`|`true` if you want to enable tracing on the underlying `apollo-server`. |
|`endpoints` | Preceding slash **required**.|Constructed as `{server.protocol}://{server.hostname}:{server.port}{endpoint.*}`|
|`endpoints.graphQL`|`string`|Typically `/graphql`, this is the location where the GraphQL api is served from.|
|`endpoints.graphQL`|`subscriptions`|Typically `/graphql`, this is the location where the GraphQL subscriptions api is served from.|
|`endpoints.graphQL`|`playground`|Typically `/graphql`, this is the location where the GraphQL playground is served from.|
|`policies`|Array of `Policy`|An array of `Policy` documents. <br> **See [Policy Reference](/api/policy.html)**|
|`hooks`|||
|`hooks.authentication`|`function`|A `Koa` middleware function that populates `ctx.user` with the authenticated user. <br>**See [Authentication](#Authentication-function)**|
|`hooks.authorization`|`function`|A hook to allow custom authorization logic. <br> _This overrides the policy engine and is not reccomended unless you require a different authorization method._ <br>**See [Authorization](#Authorization-function)**|



### Authentication function
(coming soon)

### Authorization function
(coming soon)