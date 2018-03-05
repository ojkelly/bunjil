title: Authentication
---

With authentication we take the opinion, that you should be able to bring your own. So Bunjil has very few opinions on how authentication should be handled. All you need to do is provide a hook that can decode something on the incoming `Koa.Request` and populate a user object. This can be as simple as decoding a `JWT`, or quering a session storage backend.


Todo:
  -  show how to use simpole jwt login
  -  show how to integrate with Auth0
  -  show how to use passport