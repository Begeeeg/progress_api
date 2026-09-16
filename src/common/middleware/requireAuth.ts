import type { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { UnauthorizedError } from "../error/errorStatusCode";
import UserModel from "../../feature/v1/identity/user/user.model";

interface TokenPayload extends JwtPayload {
    userId: string;
}

/**
 * Verifies that the request has a valid JWT and that the referenced user
 * still exists before allowing the request to continue.
 *
 * The authenticated user is attached to `req.user` for downstream handlers.
 */
export const requireAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        // Authentication is established from the server-managed cookie;
        // requests without a token cannot access protected routes.
        const token = req.cookies?.jwt;
        if (!token) {
            throw new UnauthorizedError("Not authenticated");
        }

        // Verify the signature and expiration before trusting the userId
        // contained in the token for the database lookup.
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET as string
        ) as TokenPayload;

        // Reload the user from the database so downstream handlers operate
        // on a current account record rather than relying only on JWT data.
        const user = await UserModel.findById(decoded.userId);

        if (!user) {
            throw new UnauthorizedError("User not found");
        }

        req.user = user;
        next();
    } catch (error) {
        // Return intentional authentication errors using their defined
        // status code and message instead of treating them as server errors.
        if (error instanceof UnauthorizedError) {
            return res
                .status(error.statusCode)
                .json({ message: error.message });
        }

        // Do not expose JWT verification details or unexpected errors
        // to the client; retain the details for server-side diagnostics.
        console.error("Error in requireAuth:", error);
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};
