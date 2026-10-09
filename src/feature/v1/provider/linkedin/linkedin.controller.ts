import { Request, Response } from "express";
import {
    BadRequestError,
    UnauthorizedError,
} from "../../../../common/error/errorStatusCode";
import { getCookieOptions } from "../../../../common/utils/provider/getCookieOptions";
import { generateOAuthState } from "../../../../common/utils/provider/generateOAuthState";
import { connectLinkedInAccountService } from "./linkedin.service";
import { buildLinkedInAuthorizationUrl } from "./linkedin.oauth";
import { LINKEDIN_STATE_COOKIE } from "./utils/linkedinConnect";

export const linkedinConnectController = async (
    req: Request,
    res: Response,
): Promise<void> => {
    if (!req.user) {
        throw new UnauthorizedError("Unauthorized");
    }

    const state = generateOAuthState();
    res.cookie(LINKEDIN_STATE_COOKIE, state, getCookieOptions());
    res.redirect(buildLinkedInAuthorizationUrl(state));
};

export const linkedinCallbackController = async (
    req: Request,
    res: Response,
): Promise<void> => {
    if (!req.user) {
        throw new UnauthorizedError("Unauthorized");
    }

    const { code, state, error } = req.query;
    if (error) {
        throw new BadRequestError(
            "LinkedIn authorization was cancelled or denied",
        );
    }

    if (typeof code !== "string" || typeof state !== "string") {
        throw new BadRequestError("Invalid LinkedIn OAuth callback");
    }

    const storedState = req.cookies?.[LINKEDIN_STATE_COOKIE];
    res.clearCookie(LINKEDIN_STATE_COOKIE, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
    });

    if (typeof storedState !== "string" || storedState !== state) {
        throw new BadRequestError("Invalid OAuth state");
    }

    await connectLinkedInAccountService({
        userId: req.user._id.toString(),
        code,
    });

    res.status(200).json({
        message: "LinkedIn account connected successfully",
    });
};
