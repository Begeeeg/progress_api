import { Request, Response } from "express";
import { buildGitHubAuthorizationUrl } from "./github.oauth";
import { connectGitHubAccountService } from "./github.service";
import { GITHUB_STATE_COOKIE } from "./utils/githubConnect";
import {
    BadRequestError,
    UnauthorizedError,
} from "../../../../common/error/errorStatusCode";
import { getCookieOptions } from "../../../../common/utils/provider/getCookieOptions";
import { generateOAuthState } from "../../../../common/utils/provider/generateOAuthState";

export const githubConnectController = async (
    req: Request,
    res: Response,
): Promise<void> => {
    if (!req.user) {
        throw new UnauthorizedError("Unauthorized");
    }

    const state = generateOAuthState();

    res.cookie(GITHUB_STATE_COOKIE, state, getCookieOptions());

    const authorizationUrl = buildGitHubAuthorizationUrl(state);

    res.redirect(authorizationUrl);
};

export const githubCallbackController = async (
    req: Request,
    res: Response,
): Promise<void> => {
    if (!req.user) {
        throw new UnauthorizedError("Unauthorized");
    }

    const { code, state, error } = req.query;

    if (error) {
        throw new BadRequestError(
            "GitHub authorization was cancelled or denied",
        );
    }

    if (typeof code !== "string" || typeof state !== "string") {
        throw new BadRequestError("Invalid GitHub OAuth callback");
    }

    const storedState = req.cookies?.[GITHUB_STATE_COOKIE];

    res.clearCookie(GITHUB_STATE_COOKIE, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
    });

    if (typeof storedState !== "string" || storedState !== state) {
        throw new BadRequestError("Invalid OAuth state");
    }

    await connectGitHubAccountService({
        userId: req.user._id.toString(),
        code,
    });

    res.status(200).json({
        message: "GitHub account connected successfully",
    });
};
