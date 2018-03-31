// From/inspired by https://github.com/helfer/graphql-disable-introspection/blob/master/index.js

import * as graphql from "graphql";

function noIntrospection(context) {
    return {
        Field(node) {
            if (
                node.name.value === "__schema" ||
                node.name.value === "__type"
            ) {
                context.reportError(
                    new graphql.GraphQLError(
                        "GraphQL introspection is disabled.",
                        [node],
                    ),
                );
            }
        },
    };
}

export { noIntrospection };
