import { Request, Response } from "express";
import * as authService from "./auth.service";
import { generateTokenandSetCookie } from "../../../../common/middleware/genTokenAndSetCookie";
import { AppError } from "../../../../common/error/errorStatusCode";

export const registerController = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const user = await authService.registerService(req.body);

        generateTokenandSetCookie(res, user.userId.toString());

        res.status(201).json({
            message: "User created successfully",
            data: user,
        });
    } catch (error) {
        if (error instanceof AppError) {
            res.status(error.statusCode).json({
                message: error.message,
            });
            return;
        }

        if (error instanceof Error) {
            res.status(500).json({
                message: error.message,
            });
            return;
        }

        res.status(500).json({
            message: "Internal server error",
        });
    }
};
