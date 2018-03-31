import { Bunjil } from "../bunjil";
/**
 * Sanitisation Middleware
 *
 * This is run as the last middleware before the response is returned.
 */
async function sanitiseMiddleware(
    this: Bunjil,
    ctx: any,
    next: () => Promise<any>,
): Promise<any> {
    // Wait for the GraphQL query to resolve
    await next();

    // Remove caching and or tracing information if there isn't
    // going to be an Apollo Engine proxy in front
    if (
        this.serverConfig.useApolloCache === false ||
        this.serverConfig.useApolloTracing === false
    ) {
        const body: any = JSON.parse(ctx.response.body);
        const sanitisedBody = {
            data: body.data,
            errors: body.errors,
            extensions: {
                ...body.extensions,
                cacheControl: this.serverConfig.useApolloCache
                    ? body.extensions.cacheControl
                    : undefined,
                tracing: this.serverConfig.useApolloTracing
                    ? body.extensions.tracing
                    : undefined,
            },
        };
        ctx.body = JSON.stringify(sanitisedBody);
    }
}

export { sanitiseMiddleware };
