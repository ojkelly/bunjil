// [ Errors ]---------------------------------------------------------------------------------------

class ExtendableError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
        this.stack = new Error(message).stack;
    }
}

class AuthorizationError extends ExtendableError {}
class ResolverError extends ExtendableError {}

export { AuthorizationError, ResolverError, ExtendableError };
