import { Policy, PolicyCondition, PolicyEffect } from "bunjil";

const policies: Policy[] = [
    {
        id: "Allow Authenticated Access to User",
        resources: ["Query::*", "User::*", "viewer:*"],
        actions: ["query"],
        effect: PolicyEffect.Allow,
        roles: ["authenticated user"],
    },
    // For authentication to work, you must allow both the mutation for login,
    // and the login response to be accessible by anonymous users.
    {
        id: "Allow Anonymous Login",
        resources: [
            "Mutation::authenticateUser",
            "AuthenticationResponse::*",
            "User::*",
        ],
        actions: ["mutation"],
        effect: PolicyEffect.Allow,
        roles: ["*"],
    },
];

export { policies };
