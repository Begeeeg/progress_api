import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorStatusCode";

export const globalErrorHandler = (
    error: unknown,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (error instanceof AppError) {
        res.status(error.statusCode).json({
            message: error.message,
        });
        return;
    }

    console.error(error);

    res.status(500).json({
        message: "Internal server error",
    });
};
