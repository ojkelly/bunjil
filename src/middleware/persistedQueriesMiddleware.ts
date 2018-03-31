import { Bunjil } from "../bunjil";
import { invert } from "lodash";

async function persistedQueriesMiddleware(
    this: Bunjil,
    ctx: any,
    next: () => Promise<any>,
): Promise<any> {
    if (this.serverConfig.usePersistedQueries) {
        const invertedMap = invert(this.getPersistedQueries());
        ctx.req.body.query = invertedMap[ctx.req.body.id];
    }
    await next();
}
export { persistedQueriesMiddleware };
