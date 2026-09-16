import { Request, Response } from "express";
import * as authService from "./auth.service";
import { generateTokenandSetCookie } from "../../../../common/middleware/genTokenAndSetCookie";
import {
    BadRequestError,
    UnauthorizedError,
} from "../../../../common/error/errorStatusCode";

/**
 * Registers a user, establishes an authenticated session, and returns
 * the newly created account data.
 */
export const registerController = async (
    req: Request,
    res: Response
): Promise<void> => {
    const user = await authService.registerService(req.body);

    // Registration immediately creates an authenticated session; email
    // verification is handled separately by the verification flow.
    generateTokenandSetCookie(res, user.userId.toString());

    res.status(201).json({
        message: "User created successfully",
        data: user,
    });
};

/**
 * Verifies the user's email using the token supplied by the verification link.
 */
export const verifyEmailController = async (
    req: Request,
    res: Response
): Promise<void> => {
    const { token } = req.query;

    // Validate the query parameter here so the service only receives
    // the string token it is designed to process.
    if (!token || typeof token !== "string") {
        throw new BadRequestError("Verification token is required");
    }

    await authService.verifyEmailService(token);

    res.status(200).json({
        message: "User email verified successfully",
    });
};

/**
 * Resends the verification email for the authenticated user's account.
 */
export const resendVerificationController = async (
    req: Request,
    res: Response
): Promise<void> => {
    // The email comes from the authenticated user context rather than the
    // request body, preventing a user from requesting verification emails
    // for another account.
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

/**
 * Logs out the authenticated user, updates their account state,
 * and removes the JWT cookie from the client.
 */
export const logOutController = async (
    req: Request,
    res: Response
): Promise<void> => {
    const userId = req.user?._id.toString();

    // The user ID must come from the authenticated request context rather
    // than client-provided data to ensure the correct account is logged out.
    if (!userId) {
        throw new UnauthorizedError(
            "Unauthorized: User ID not found in user context"
        );
    }

    await authService.logOutService(userId);

    // Expire the authentication cookie on the client so subsequent requests
    // no longer send the JWT as part of the browser session.
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

/**
 * Authenticates a user, updates their login state, and establishes
 * an authenticated session through the JWT cookie.
 */
export const logInController = async (
    req: Request,
    res: Response
): Promise<void> => {
    const user = await authService.logInService(req.body);

    // Keep the JWT out of the response body and store it in the
    // HTTP-only authentication cookie instead.
    generateTokenandSetCookie(res, user.userId.toString());

    res.status(200).json({
        message: "User logged in successfully",
        data: user,
    });
};
