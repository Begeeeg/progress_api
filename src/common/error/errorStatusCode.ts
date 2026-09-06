export class AppError extends Error {
    constructor(public statusCode: number, message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

export class BadRequestError extends AppError {
    constructor(message = "Bad request") {
        super(400, message);
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized") {
        super(401, message);
    }
}

export class ForbiddenError extends AppError {
    constructor(message = "Forbidden") {
        super(403, message);
    }
}

export class NotFoundError extends AppError {
    constructor(message = "Resource not found") {
        super(404, message);
    }
}

export class ConflictError extends AppError {
    constructor(message = "Resource already exists") {
        super(409, message);
    }
}
