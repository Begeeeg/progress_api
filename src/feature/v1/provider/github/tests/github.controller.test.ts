import { beforeEach, describe, expect, it, vi } from "vitest";
import { Request, Response } from "express";

vi.mock("../github.oauth", () => ({
    buildGitHubAuthorizationUrl: vi.fn(),
}));

vi.mock("../github.service", () => ({
    connectGitHubAccountService: vi.fn(),
}));

vi.mock("../../../../../common/utils/provider/generateOAuthState", () => ({
    generateOAuthState: vi.fn(() => "generated-state"),
}));

import {
    BadRequestError,
    UnauthorizedError,
} from "../../../../../common/error/errorStatusCode";
import { buildGitHubAuthorizationUrl } from "../github.oauth";
import { connectGitHubAccountService } from "../github.service";
import {
    githubCallbackController,
    githubConnectController,
} from "../github.controller";
import { GITHUB_STATE_COOKIE } from "../utils/githubConnect";

const mockRes = () => {
    const res: Partial<Response> = {};
    res.cookie = vi.fn().mockReturnValue(res);
    res.clearCookie = vi.fn().mockReturnValue(res);
    res.redirect = vi.fn().mockReturnValue(res);
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response;
};

const authedUser = {
    _id: { toString: () => "user-id" },
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("github.controller", () => {
    it("sets OAuth state and redirects to GitHub", async () => {
        vi.mocked(buildGitHubAuthorizationUrl).mockReturnValue(
            "https://github.com/login/oauth/authorize?state=generated-state",
        );
        const req = { user: authedUser } as unknown as Request;
        const res = mockRes();

        await githubConnectController(req, res);

        expect(res.cookie).toHaveBeenCalledWith(
            GITHUB_STATE_COOKIE,
            "generated-state",
            expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
        );
        expect(buildGitHubAuthorizationUrl).toHaveBeenCalledWith(
            "generated-state",
        );
        expect(res.redirect).toHaveBeenCalledWith(
            "https://github.com/login/oauth/authorize?state=generated-state",
        );
    });

    it("rejects a connect request without an authenticated user", async () => {
        await expect(
            githubConnectController(
                { user: undefined } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("rejects denied OAuth authorization", async () => {
        await expect(
            githubCallbackController(
                {
                    user: authedUser,
                    query: { error: "access_denied" },
                } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("rejects a callback request without an authenticated user", async () => {
        await expect(
            githubCallbackController(
                {
                    user: undefined,
                    query: { code: "auth-code", state: "oauth-state" },
                } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toBeInstanceOf(UnauthorizedError);

        expect(connectGitHubAccountService).not.toHaveBeenCalled();
    });

    it("rejects callbacks missing a code or state", async () => {
        await expect(
            githubCallbackController(
                {
                    user: authedUser,
                    query: { code: "auth-code" },
                    cookies: {},
                } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toThrow("Invalid GitHub OAuth callback");
    });

    it("rejects callbacks with a non-string authorization code", async () => {
        await expect(
            githubCallbackController(
                {
                    user: authedUser,
                    query: { code: ["auth-code"], state: "oauth-state" },
                    cookies: { [GITHUB_STATE_COOKIE]: "oauth-state" },
                } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toThrow("Invalid GitHub OAuth callback");

        expect(connectGitHubAccountService).not.toHaveBeenCalled();
    });

    it("clears and rejects a mismatched OAuth state", async () => {
        const res = mockRes();

        await expect(
            githubCallbackController(
                {
                    user: authedUser,
                    query: { code: "auth-code", state: "query-state" },
                    cookies: { [GITHUB_STATE_COOKIE]: "cookie-state" },
                } as unknown as Request,
                res,
            ),
        ).rejects.toThrow("Invalid OAuth state");

        expect(res.clearCookie).toHaveBeenCalledWith(
            GITHUB_STATE_COOKIE,
            expect.objectContaining({ httpOnly: true, path: "/" }),
        );
        expect(connectGitHubAccountService).not.toHaveBeenCalled();
    });

    it("connects the account after validating OAuth state", async () => {
        const res = mockRes();

        await githubCallbackController(
            {
                user: authedUser,
                query: { code: "auth-code", state: "matching-state" },
                cookies: { [GITHUB_STATE_COOKIE]: "matching-state" },
            } as unknown as Request,
            res,
        );

        expect(connectGitHubAccountService).toHaveBeenCalledWith({
            userId: "user-id",
            code: "auth-code",
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "GitHub account connected successfully",
        });
    });
});
