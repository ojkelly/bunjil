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
        authenticationCallback: AuthenticationCallback;
        authorizationCallback: AuthorizationCallback;
        sanizationCallback: SantizationCallback<any>;
    };
};

interface AuthenticationCallback {
    (args: any, info: any, context: any): void;
}

type AuthorizationCallbackOptions = {
    action: string;
    resource: string;
    context: any;
};
interface AuthorizationCallback {
    (AuthorizationCallbackOptions): boolean;
}
type SantizationCallbackOptions<Value> = {
    context: any;
    field: string;
    resource: string;
    returnType: any;
    value: Value;
};
interface SantizationCallback<Value> {
    (SantizationCallbackOptions): any;
}

export {
    BunjilOptions,
    AuthenticationCallback,
    AuthorizationCallback,
    AuthorizationCallbackOptions,
    SantizationCallback,
    SantizationCallbackOptions,
    playgroundOptions,
    playgroundTheme,
    PlaygroundSettings,
    Policy,
    PolicyEffect,
    PolicyCondition,
    OnTypeConflictCallback,
};
