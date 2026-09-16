import type { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

import {
    AppError,
    UnauthorizedError,
    ForbiddenError,
} from "../error/errorStatusCode";
import UserModel from "../../feature/v1/identity/user/user.model";
import AuthModel from "../../feature/v1/identity/auth/auth.model";

interface TokenPayload extends JwtPayload {
    userId: string;
}

/**
 * Protects authenticated routes by validating the JWT, confirming that
 * the referenced user still exists, and enforcing account verification.
 *
 * Authentication state is attached to `req.user` for downstream handlers.
 */
export const protectRoutes = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        // The JWT is stored in an HTTP-only cookie, so authentication is
        // established from the server-managed cookie rather than request data.
        const token = req.cookies?.jwt;
        if (!token) {
            throw new UnauthorizedError("Not authenticated");
        }

        // jwt.verify() validates the token signature and expiration before
        // its userId is trusted for the database lookup below.
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET as string
        ) as TokenPayload;

        // Excluding the password prevents credential data from being attached
        // to the authenticated request context used by downstream handlers.
        const user = await UserModel.findById(decoded.userId).select(
            "-password"
        );

        if (!user) {
            throw new UnauthorizedError("User not found");
        }

        // Require the separate authentication record so access depends on
        // both a valid user account and its corresponding auth state.
        const auth = await AuthModel.findOne({ userId: user._id });
        if (!auth) {
            throw new UnauthorizedError("Auth record not found for user");
        }

        // Verification is an authorization requirement for protected routes;
        // an existing authenticated account is not automatically permitted access.
        if (!auth.isVerified) {
            throw new ForbiddenError("User is not verified");
        }

        req.user = user;
        next();
    } catch (error) {
        // Preserve intentional API errors such as 401/403 instead of
        // converting every failure into a generic authentication error.
        if (error instanceof AppError) {
            return res
                .status(error.statusCode)
                .json({ message: error.message });
        }

        // Unexpected errors and JWT verification failures are not exposed
        // to the client beyond a generic authentication failure.
        console.error("Error in protectRoutes:", error);
        return res.status(401).json({
            message: "Invalid or expired token",
        });
    }
};
