title: Authorization
---

> Authorization: what a user can or cannot do

Authorization is a bit different however. For it to work you need to provide roles in the form of  an array of strings on the user object.

For example: `user.roles = [ 'authenticated user', 'editor' ]`, would work.

The authorization engine in powered by another module called `wahn`. It's a general purpose Policy Based Access Control library. It was written for Bunjil, and has been implemented in Bunjil to suit the nature of GraphQL.

> You may also want to look at the [Policy Reference](/api/policy.html), for detail on how a policy is constructed.

## Why use a policy?

In evaluating the options for authorization a few criteria were defined to be suitable for Bunjil.

The implementation:
1. should work at the field level for each resolver,
2. allow or deny access to `roles`,
3. deny access to specific types of fields,
4. be flexible enough to work with a massive schema,
5. be able to be defined outside the logic of the server.

From these requirements Policy Based Access Control (PBAC) seemed the most flexible and powerful, and after implementation that was confirmed.

## How does it work?

### Runtime
When a GraphQL request is processed, we execute all the relevant resolver functions. To add authorization, we look at the incoming query and derive a `resource` string by taking the parent `Type` and the current `field`. They are seperated by a double-colon `::`.

The `resource` is passed with the action (one of `query`, `mutation`, or `subscription`), and the GraphQL `context` object (which contains information on the `request` and our `user`) to our PBAC library for evaluation.

It's then up to the PBAC library, in this case [wahn](https://www.npm.org/package/wahn), to evaluate our request against the policies we added before starting the server.

### Policies

Before the server is started we pass in an array of `Policy` objects. These are JSON objects. There are types available to make writing them easier with Typescript. You could also write them as plain JSON.

The policies themselves are described in detail in the [Policy Reference](/api/policy.html).


## Guides

*(To be written, soon)*
- How to grant access to a whole type, or a single field
- How to deny access to a single field, while granting access to the rest of the type
- How to deny a request based on a field on the request object
- How to deny access to a mutation based on the time since the sesion was started
