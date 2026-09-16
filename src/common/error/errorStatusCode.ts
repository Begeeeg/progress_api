// Base application error used to attach an HTTP status code to errors
// that can be handled consistently by the API error middleware.
export class AppError extends Error {
    constructor(public statusCode: number, message: string) {
        super(message);

        // Preserve the specific error class name for logging and error handling.
        this.name = this.constructor.name;
    }
}

// 400 indicates that the request failed validation or contains invalid input.
export class BadRequestError extends AppError {
    constructor(message = "Bad request") {
        super(400, message);
    }
}

// 401 indicates that authentication is required or the provided credentials
// or authentication token could not be accepted.
export class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized") {
        super(401, message);
    }
}

// 403 indicates that the user is authenticated but is not permitted
// to perform the requested operation.
export class ForbiddenError extends AppError {
    constructor(message = "Forbidden") {
        super(403, message);
    }
}

// 404 indicates that the requested resource could not be found.
export class NotFoundError extends AppError {
    constructor(message = "Resource not found") {
        super(404, message);
    }
}

// 409 indicates that the request conflicts with the current state
// of the resource, such as attempting to create a duplicate record.
export class ConflictError extends AppError {
    constructor(message = "Resource already exists") {
        super(409, message);
    }
}
