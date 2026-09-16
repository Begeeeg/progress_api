import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorStatusCode";

/**
 * Centralizes API error responses so expected application errors
 * return their intended HTTP status while unexpected errors are
 * logged server-side and exposed to clients only as a generic 500 response.
 */
export const globalErrorHandler = (
    error: unknown,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    // AppError instances represent known application failures whose
    // status code and message are safe to return as part of the API response.
    if (error instanceof AppError) {
        res.status(error.statusCode).json({
            message: error.message,
        });
        return;
    }

    // Unexpected errors are logged for server-side diagnosis without
    // exposing implementation details that could leak sensitive information.
    console.error(error);

    res.status(500).json({
        message: "Internal server error",
    });
};
