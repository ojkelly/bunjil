import { GraphQLEnumValue } from "graphql";
import { SchemaDirectiveVisitor } from "graphql-tools";

class CacheControlDirective extends SchemaDirectiveVisitor {
    public visitEnumValue(value: GraphQLEnumValue) {
        // value.cacheControl = true;
        // value.ttl = this.args.ttle;
    }
}

export { CacheControlDirective };
