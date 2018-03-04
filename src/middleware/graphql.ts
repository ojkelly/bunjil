// Forked from apollo-server-koa
// https://github.com/apollographql/apollo-server/blob/master/packages/apollo-server-koa/src/koaApollo.ts
//
// This is similar, but has a few additions to make authentication and authorization work for
// Bunjil

import {
    GraphQLOptions,
    HttpQueryError,
    runHttpQuery,
} from "apollo-server-core";
import * as Koa from "koa";

interface KoaHandler {
    (req: any, next): void;
}

function graphqlKoa(options: GraphQLOptions): KoaHandler {
    if (!options) {
        throw new Error("Apollo Server requires options.");
    }

    if (arguments.length > 1) {
        throw new Error(
            `Apollo Server expects exactly one argument, got ${
                arguments.length
            }`,
        );
    }

    return (ctx: any): Promise<void> => {
        let serverOptions: GraphQLOptions = {
            ...options,
            schema: options.schema,
        };
        // Add any user information to the graphQL context
        if (ctx.user) {
            serverOptions.context = {
                ...serverOptions.context,
                user: { ...ctx.user },
                request: ctx.request,
            };
        }
        return runHttpQuery([ctx], {
            method: ctx.request.method,
            options: serverOptions,
            query:
                ctx.request.method === "POST"
                    ? ctx.request.body
                    : ctx.request.query,
        }).then(
            gqlResponse => {
                ctx.set("Content-Type", "application/json");
                ctx.body = gqlResponse;
            },
            (error: HttpQueryError) => {
                if ("HttpQueryError" !== error.name) {
                    throw error;
                }

                if (error.headers) {
                    Object.keys(error.headers).forEach(header => {
                        ctx.set(header, error.headers[header]);
                    });
                }

                ctx.status = error.statusCode;
                ctx.body = error.message;
            },
        );
    };
}

export { graphqlKoa, KoaHandler };
