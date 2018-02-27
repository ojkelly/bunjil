import {
    Bunjil,
    Policy,
    PolicyCondition,
    PolicyEffect,
} from "../../../src/index";
import { Prisma, typeDefs } from "./.graphql/prisma";
import { extractFragmentReplacements, forwardTo } from "prisma-binding";
import { FragmentReplacements } from "graphql-binding/dist/types";
import { makeExecutableSchema } from "graphql-tools";
import * as faker from "faker";

console.log("Running Simple Example");

// const debug: boolean = process.env.NODE_ENV === "dev";
const debug: boolean = true;
// [ Prepare database ]-----------------------------------------------------------------------------

const prisma: Prisma = new Prisma({
    endpoint: process.env.PRISMA_ENDPOINT, // the endpoint of the Prisma DB service
    secret: process.env.PRISMA_SECRET, // taken from database/prisma.yml
    debug, // log all GraphQL queries & mutations
});

// [ Prepare server ]-------------------------------------------------------------------------------

const policies: Policy[] = [
    {
        id: faker.random.uuid(),
        resources: ["Query::posts", "Post::*", "User::*", "Author::*"],
        actions: ["query"],
        effect: PolicyEffect.Allow,
        roles: ["authenticated user"],
    },
];

const bunjil: Bunjil = new Bunjil({
    server: {
        hostname: `${process.env.BUNJIL_HOSTNAME}`,
        protocol: `${process.env.BUNJIL_PROTOCOL}`,
        port: Number(process.env.BUNJIL_PORT),
        tracing: true,
        cacheControl: true,
    },
    debug,
    playgroundOptions: {
        enabled: true,
    },
    endpoints: {
        graphQL: "/graphql",
        subscriptions: "/graphql/subscriptions",
        playground: "/playground",
    },
    policies,
});

bunjil.addPrismaSchema({ typeDefs, prisma, contextKey: "database" });

// Hide the uuid, and password fields by not including them
// const publicUserType: string = `
//   type User {
//     email: String!
//   }
// `;

// // Replace the `User` type
// bunjil.addSchema({
//     schemas: [publicUserType],
// });

// Add prisma context

// [ Register Middleware ]--------------------------------------------------------------------------

// [ Start Server ]---------------------------------------------------------------------------------
// tslint:disable-next-line:no-console
bunjil.start(() => {
    console.log(
        `Started on ${process.env.BUNJIL_PROTOCOL}://${
            process.env.BUNJIL_HOSTNAME
        }:${process.env.BUNJIL_PORT}`,
    );

    // Test GraphQL query
});
