import * as Koa from "koa";
import { Policy, PolicyEffect, PolicyCondition } from "wahn";
import { GraphQLSchema, GraphQLNamedType, GraphQLError } from "graphQL";
import { GraphQLConfigData } from "graphQL-config";

interface OnTypeConflictCallback {
    (left: GraphQLNamedType, right: GraphQLNamedType): GraphQLNamedType;
}

type playgroundOptions = {
    enabled: boolean;
    endpoint?: string;
    subscriptionsEndpoint?: string;
    htmlTitle?: string;
    workspaceName?: string;
    env?: any;
    config?: GraphQLConfigData;
    settings?: PlaygroundSettings;
};
declare type playgroundTheme = "dark" | "light";
interface PlaygroundSettings {
    ["general.betaUpdates"]: boolean;
    ["editor.theme"]: playgroundTheme;
    ["editor.reuseHeaders"]: boolean;
    ["tracing.hideTracingResponse"]: boolean;
}

type BunjilOptions = {
    // Meta
    debug?: boolean;

    playgroundOptions: playgroundOptions;

    // Koa
    server: {
        protocol: string;
        hostname: string;
        port?: number;
        tracing?: boolean | undefined;
        cacheControl?: boolean | undefined;
    };

    // GraphQL
    endpoints: {
        graphQL: string | undefined;
        subscriptions: string | undefined;
        playground: string | undefined;
    };

    // Access control
    policies: Policy[];

    hooks?: {
        authentication?: AuthenticationMiddleware;
        authorization?: AuthorizationCallback;
    };
};

interface AuthenticationMiddleware {
    (ctx: Koa.Context, next: () => Promise<any>): Promise<any>;
}

type AuthorizationCallbackOptions = {
    action: string;
    resource: string;
    context: any;
};
interface AuthorizationCallback {
    (AuthorizationCallbackOptions): boolean;
}

export {
    BunjilOptions,
    AuthenticationMiddleware,
    AuthorizationCallback,
    AuthorizationCallbackOptions,
    playgroundOptions,
    playgroundTheme,
    PlaygroundSettings,
    Policy,
    PolicyEffect,
    PolicyCondition,
    OnTypeConflictCallback,
};
