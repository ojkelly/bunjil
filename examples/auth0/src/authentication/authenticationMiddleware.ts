import * as Koa from "koa";
import * as jwt from "jsonwebtoken";
import { config } from "../config";
import { AccessDeniedError } from "../errors";

async function authenticationMiddleware(
    ctx: Koa.Context,
    next: () => Promise<any>,
): Promise<any> {
    // Check the Authentication header for a Bearer token
    try {
        if (
            ctx &&
            ctx.request &&
            ctx.request.header &&
            ctx.request.header.authorization &&
            // Make sure it's a bearer token
            ctx.request.header.authorization.startsWith("Bearer: ")
        ) {
            // If there is a token, decode it
            const decoded: any = jwt.verify(
                ctx.request.header.authorization.replace("Bearer: ", ""),
                config.jwt.secret,
                {
                    issuer: config.jwt.issuer,
                    audience: config.jwt.audience,
                },
            );
            // Add that to ctx.user
            ctx.user = {
                ...decoded,
                // In this example the subject field of the jwt contains the id
                // So we need to explictly set it to the id field for Bunjil
                id: decoded.subject,
            };
        }
    } catch (error) {
        console.error(error.message);
        // If authentication fails, pass an anonymous user to Bunjil, and let
        // the Authorization policies deal with errors.
        // This way, we get a clean access denied error back via GraphQL
        ctx.user = {
            id: null,
            roles: ["anonymous user", "authentication failed"],
        };
    }
    // hand off to the next middleware
    await next();
}

export { authenticationMiddleware };
