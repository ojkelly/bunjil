import { authenticateUserResolver } from "./mutation/authenticateUser";

const resolvers: any = {
    Query: {},
    Mutation: {
        authenticateUser: authenticateUserResolver,
    },
};

export { resolvers };
