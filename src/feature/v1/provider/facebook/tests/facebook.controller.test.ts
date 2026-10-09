import { beforeEach, describe, expect, it, vi } from "vitest";
import { Request, Response } from "express";

vi.mock("../facebook.oauth", () => ({
    buildFacebookAuthorizationUrl: vi.fn(),
}));

vi.mock("../facebook.service", () => ({
    connectFacebookAccountService: vi.fn(),
}));

vi.mock("../../../../../common/utils/provider/generateOAuthState", () => ({
    generateOAuthState: vi.fn(() => "generated-state"),
}));

import {
    BadRequestError,
    UnauthorizedError,
} from "../../../../../common/error/errorStatusCode";
import { buildFacebookAuthorizationUrl } from "../facebook.oauth";
import { connectFacebookAccountService } from "../facebook.service";
import {
    facebookCallbackController,
    facebookConnectController,
} from "../facebook.controller";
import { FACEBOOK_STATE_COOKIE } from "../utils/facebookConnect";

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

describe("facebook.controller", () => {
    it("sets state and redirects to Facebook", async () => {
        vi.mocked(buildFacebookAuthorizationUrl).mockReturnValue(
            "https://www.facebook.com/v19.0/dialog/oauth?state=generated-state",
        );
        const req = { user: authedUser } as unknown as Request;
        const res = mockRes();

        await facebookConnectController(req, res);

        expect(res.cookie).toHaveBeenCalledWith(
            FACEBOOK_STATE_COOKIE,
            "generated-state",
            expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
        );
        expect(buildFacebookAuthorizationUrl).toHaveBeenCalledWith(
            "generated-state",
        );
        expect(res.redirect).toHaveBeenCalledWith(
            "https://www.facebook.com/v19.0/dialog/oauth?state=generated-state",
        );
    });

    it("rejects connect requests without an authenticated user", async () => {
        await expect(
            facebookConnectController(
                { user: undefined } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("rejects denied OAuth authorization", async () => {
        await expect(
            facebookCallbackController(
                {
                    user: authedUser,
                    query: { error: "access_denied" },
                } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("rejects callback requests without an authenticated user", async () => {
        await expect(
            facebookCallbackController(
                {
                    user: undefined,
                    query: { code: "auth-code", state: "oauth-state" },
                } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toBeInstanceOf(UnauthorizedError);

        expect(connectFacebookAccountService).not.toHaveBeenCalled();
    });

    it("rejects callback requests without code and state", async () => {
        await expect(
            facebookCallbackController(
                {
                    user: authedUser,
                    query: { code: "auth-code" },
                    cookies: {},
                } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toThrow("Invalid Facebook OAuth callback");
    });

    it("clears and rejects mismatched state", async () => {
        const res = mockRes();

        await expect(
            facebookCallbackController(
                {
                    user: authedUser,
                    query: { code: "auth-code", state: "query-state" },
                    cookies: { [FACEBOOK_STATE_COOKIE]: "cookie-state" },
                } as unknown as Request,
                res,
            ),
        ).rejects.toThrow("Invalid OAuth state");

        expect(res.clearCookie).toHaveBeenCalledWith(
            FACEBOOK_STATE_COOKIE,
            expect.objectContaining({ httpOnly: true, path: "/" }),
        );
        expect(connectFacebookAccountService).not.toHaveBeenCalled();
    });

    it("connects the account after a valid state check", async () => {
        const res = mockRes();

        await facebookCallbackController(
            {
                user: authedUser,
                query: { code: "auth-code", state: "matching-state" },
                cookies: { [FACEBOOK_STATE_COOKIE]: "matching-state" },
            } as unknown as Request,
            res,
        );

        expect(connectFacebookAccountService).toHaveBeenCalledWith({
            userId: "user-id",
            code: "auth-code",
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Facebook account connected successfully",
        });
    });
});
