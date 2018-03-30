import { createError } from "apollo-errors";

const AccessDeniedError = createError("AccessDeniedError", {
    message: "Access Denied",
});

export { AccessDeniedError };
