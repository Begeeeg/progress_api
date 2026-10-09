import { beforeEach, describe, expect, it, vi } from "vitest";
import { Request, Response } from "express";

vi.mock("../google.oauth", () => ({
    buildGoogleAuthorizationUrl: vi.fn(),
}));

vi.mock("../google.service", () => ({
    connectGoogleAccountService: vi.fn(),
}));

vi.mock("../../../../../common/utils/provider/generateOAuthState", () => ({
    generateOAuthState: vi.fn(() => "generated-state"),
}));

import {
    BadRequestError,
    UnauthorizedError,
} from "../../../../../common/error/errorStatusCode";
import { buildGoogleAuthorizationUrl } from "../google.oauth";
import { connectGoogleAccountService } from "../google.service";
import {
    googleCallbackController,
    googleConnectController,
} from "../google.controller";
import { GOOGLE_STATE_COOKIE } from "../utils/googleConnect";

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

describe("google.controller", () => {
    it("sets OAuth state and redirects to Google", async () => {
        vi.mocked(buildGoogleAuthorizationUrl).mockReturnValue(
            "https://accounts.google.com/authorize?state=generated-state",
        );
        const req = { user: authedUser } as unknown as Request;
        const res = mockRes();

        await googleConnectController(req, res);

        expect(res.cookie).toHaveBeenCalledWith(
            GOOGLE_STATE_COOKIE,
            "generated-state",
            expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
        );
        expect(buildGoogleAuthorizationUrl).toHaveBeenCalledWith(
            "generated-state",
        );
        expect(res.redirect).toHaveBeenCalledWith(
            "https://accounts.google.com/authorize?state=generated-state",
        );
    });

    it("rejects a connect request without an authenticated user", async () => {
        await expect(
            googleConnectController(
                { user: undefined } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("rejects denied OAuth authorization", async () => {
        await expect(
            googleCallbackController(
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
            googleCallbackController(
                {
                    user: undefined,
                    query: { code: "auth-code", state: "oauth-state" },
                } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toBeInstanceOf(UnauthorizedError);

        expect(connectGoogleAccountService).not.toHaveBeenCalled();
    });

    it("rejects callbacks missing a code or state", async () => {
        await expect(
            googleCallbackController(
                {
                    user: authedUser,
                    query: { code: "auth-code" },
                    cookies: {},
                } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toThrow("Invalid Google OAuth callback");
    });

    it("clears and rejects a mismatched OAuth state", async () => {
        const res = mockRes();
        await expect(
            googleCallbackController(
                {
                    user: authedUser,
                    query: { code: "auth-code", state: "query-state" },
                    cookies: { [GOOGLE_STATE_COOKIE]: "cookie-state" },
                } as unknown as Request,
                res,
            ),
        ).rejects.toThrow("Invalid OAuth state");

        expect(res.clearCookie).toHaveBeenCalledWith(
            GOOGLE_STATE_COOKIE,
            expect.objectContaining({ httpOnly: true, path: "/" }),
        );
        expect(connectGoogleAccountService).not.toHaveBeenCalled();
    });

    it("connects the account after validating state", async () => {
        const res = mockRes();
        await googleCallbackController(
            {
                user: authedUser,
                query: { code: "auth-code", state: "matching-state" },
                cookies: { [GOOGLE_STATE_COOKIE]: "matching-state" },
            } as unknown as Request,
            res,
        );

        expect(connectGoogleAccountService).toHaveBeenCalledWith({
            userId: "user-id",
            code: "auth-code",
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Google account connected successfully",
        });
    });
});
