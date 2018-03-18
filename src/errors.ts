// [ Errors ]---------------------------------------------------------------------------------------

class ExtendableError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
        this.stack = new Error(message).stack;
    }
}

class AuthorizationError extends ExtendableError {
    public name: string = "AuthorizationError";
    constructor(
        public denyType: string = "Denied",
        public reason: string = "Access Denied",
    ) {
        super(reason);
        this.reason = reason;
        this.denyType = denyType;
    }
}

class ResolverError extends ExtendableError {}

export { AuthorizationError, ResolverError, ExtendableError };
