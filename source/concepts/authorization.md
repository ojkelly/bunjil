title: Authorization
---

Authorization is a bit different however. For it to work you need to provide roles in the form of  an array of strings on the user object.

For example: `user.roles = [ 'authenticated user', 'editor' ]`, would work.

The authorization engine in power by another module called `wahn`. It's a general purpose Policy Based Access Control library. It was written for Bunjil, and has been implemented to suit the nature of GraphQL.

Todo:
  - Explain how the policy engine works
  - how explicit deny works
  - show examples of policies
  - show how to block a request based on ip
  - show how to block request based on time since jwt issue (for mfa for eg)