import { Request, Response } from "express";
import {
    BadRequestError,
    UnauthorizedError,
} from "../../../../common/error/errorStatusCode";
import { getCookieOptions } from "../../../../common/utils/provider/getCookieOptions";
import { generateOAuthState } from "../../../../common/utils/provider/generateOAuthState";
import { connectGoogleAccountService } from "./google.service";
import { buildGoogleAuthorizationUrl } from "./google.oauth";
import { GOOGLE_STATE_COOKIE } from "./utils/googleConnect";

export const googleConnectController = async (
    req: Request,
    res: Response,
): Promise<void> => {
    if (!req.user) {
        throw new UnauthorizedError("Unauthorized");
    }

    const state = generateOAuthState();
    res.cookie(GOOGLE_STATE_COOKIE, state, getCookieOptions());
    res.redirect(buildGoogleAuthorizationUrl(state));
};

export const googleCallbackController = async (
    req: Request,
    res: Response,
): Promise<void> => {
    if (!req.user) {
        throw new UnauthorizedError("Unauthorized");
    }

    const { code, state, error } = req.query;
    if (error) {
        throw new BadRequestError(
            "Google authorization was cancelled or denied",
        );
    }

    if (typeof code !== "string" || typeof state !== "string") {
        throw new BadRequestError("Invalid Google OAuth callback");
    }

    const storedState = req.cookies?.[GOOGLE_STATE_COOKIE];
    res.clearCookie(GOOGLE_STATE_COOKIE, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
    });

    if (typeof storedState !== "string" || storedState !== state) {
        throw new BadRequestError("Invalid OAuth state");
    }

    await connectGoogleAccountService({
        userId: req.user._id.toString(),
        code,
    });

    res.status(200).json({
        message: "Google account connected successfully",
    });
};
