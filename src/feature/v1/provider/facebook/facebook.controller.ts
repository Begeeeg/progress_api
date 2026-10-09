import { Request, Response } from "express";
import {
    BadRequestError,
    UnauthorizedError,
} from "../../../../common/error/errorStatusCode";
import { getCookieOptions } from "../../../../common/utils/provider/getCookieOptions";
import { generateOAuthState } from "../../../../common/utils/provider/generateOAuthState";
import { buildFacebookAuthorizationUrl } from "./facebook.oauth";
import { connectFacebookAccountService } from "./facebook.service";
import { FACEBOOK_STATE_COOKIE } from "./utils/facebookConnect";

export const facebookConnectController = async (
    req: Request,
    res: Response,
): Promise<void> => {
    if (!req.user) {
        throw new UnauthorizedError("Unauthorized");
    }

    const state = generateOAuthState();

    res.cookie(FACEBOOK_STATE_COOKIE, state, getCookieOptions());

    res.redirect(buildFacebookAuthorizationUrl(state));
};

export const facebookCallbackController = async (
    req: Request,
    res: Response,
): Promise<void> => {
    if (!req.user) {
        throw new UnauthorizedError("Unauthorized");
    }

    const { code, state, error } = req.query;

    if (error) {
        throw new BadRequestError(
            "Facebook authorization was cancelled or denied",
        );
    }

    if (typeof code !== "string" || typeof state !== "string") {
        throw new BadRequestError("Invalid Facebook OAuth callback");
    }

    const storedState = req.cookies?.[FACEBOOK_STATE_COOKIE];

    res.clearCookie(FACEBOOK_STATE_COOKIE, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
    });

    if (typeof storedState !== "string" || storedState !== state) {
        throw new BadRequestError("Invalid OAuth state");
    }

    await connectFacebookAccountService({
        userId: req.user._id.toString(),
        code,
    });

    res.status(200).json({
        message: "Facebook account connected successfully",
    });
};
