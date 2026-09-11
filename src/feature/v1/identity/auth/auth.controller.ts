import { Request, Response } from "express";
import * as authService from "./auth.service";
import { generateTokenandSetCookie } from "../../../../common/middleware/genTokenAndSetCookie";
import {
    BadRequestError,
    UnauthorizedError,
} from "../../../../common/error/errorStatusCode";

export const registerController = async (
    req: Request,
    res: Response
): Promise<void> => {
    const user = await authService.registerService(req.body);

    generateTokenandSetCookie(res, user.userId.toString());

    res.status(201).json({
        message: "User created successfully",
        data: user,
    });
};

export const verifyEmailController = async (
    req: Request,
    res: Response
): Promise<void> => {
    const { token } = req.query;

    if (!token || typeof token !== "string") {
        throw new BadRequestError("Verification token is required");
    }

    await authService.verifyEmailService(token);

    res.status(200).json({
        message: "User email verified successfully",
    });
};

export const resendVerificationController = async (
    req: Request,
    res: Response
): Promise<void> => {
    const email = req.user?.email;

    if (!email) {
        throw new UnauthorizedError(
            "Unauthorized: Email not found in user context"
        );
    }

    await authService.resendVerificationService(email);

    res.status(200).json({
        message: "Verification send to email successfully",
    });
};

export const logOutController = async (
    req: Request,
    res: Response
): Promise<void> => {
    const userId = req.user?._id.toString();

    if (!userId) {
        throw new UnauthorizedError(
            "Unauthorized: User ID not found in user context"
        );
    }

    await authService.logOutService(userId);

    res.cookie("jwt", "", {
        maxAge: 0,
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
    });

    res.status(200).json({
        message: "User logged out successfully",
    });
};

export const logInController = async (
    req: Request,
    res: Response
): Promise<void> => {
    const user = await authService.logInService(req.body);

    generateTokenandSetCookie(res, user.userId.toString());

    res.status(200).json({
        message: "User logged in successfully",
        data: user,
    });
};
