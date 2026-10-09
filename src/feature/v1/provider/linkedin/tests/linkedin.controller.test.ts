import { beforeEach, describe, expect, it, vi } from "vitest";
import { Request, Response } from "express";

vi.mock("../linkedin.oauth", () => ({
    buildLinkedInAuthorizationUrl: vi.fn(),
}));

vi.mock("../linkedin.service", () => ({
    connectLinkedInAccountService: vi.fn(),
}));

vi.mock("../../../../../common/utils/provider/generateOAuthState", () => ({
    generateOAuthState: vi.fn(() => "generated-state"),
}));

import {
    BadRequestError,
    UnauthorizedError,
} from "../../../../../common/error/errorStatusCode";
import { buildLinkedInAuthorizationUrl } from "../linkedin.oauth";
import { connectLinkedInAccountService } from "../linkedin.service";
import {
    linkedinCallbackController,
    linkedinConnectController,
} from "../linkedin.controller";
import { LINKEDIN_STATE_COOKIE } from "../utils/linkedinConnect";

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

describe("linkedin.controller", () => {
    it("sets the OAuth state cookie and redirects to LinkedIn", async () => {
        vi.mocked(buildLinkedInAuthorizationUrl).mockReturnValue(
            "https://www.linkedin.com/oauth/v2/authorization?state=generated-state",
        );
        const req = { user: authedUser } as unknown as Request;
        const res = mockRes();

        await linkedinConnectController(req, res);

        expect(res.cookie).toHaveBeenCalledWith(
            LINKEDIN_STATE_COOKIE,
            "generated-state",
            expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
        );
        expect(buildLinkedInAuthorizationUrl).toHaveBeenCalledWith(
            "generated-state",
        );
        expect(res.redirect).toHaveBeenCalledWith(
            "https://www.linkedin.com/oauth/v2/authorization?state=generated-state",
        );
    });

    it("rejects connect requests without an authenticated user", async () => {
        await expect(
            linkedinConnectController(
                { user: undefined } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("rejects denied authorization callbacks", async () => {
        await expect(
            linkedinCallbackController(
                {
                    user: authedUser,
                    query: { error: "access_denied" },
                } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("rejects callbacks without an authenticated user", async () => {
        await expect(
            linkedinCallbackController(
                {
                    user: undefined,
                    query: { code: "auth-code", state: "oauth-state" },
                } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toBeInstanceOf(UnauthorizedError);

        expect(connectLinkedInAccountService).not.toHaveBeenCalled();
    });

    it("rejects callbacks without code and state", async () => {
        await expect(
            linkedinCallbackController(
                {
                    user: authedUser,
                    query: { code: "auth-code" },
                    cookies: {},
                } as unknown as Request,
                mockRes(),
            ),
        ).rejects.toThrow("Invalid LinkedIn OAuth callback");
    });

    it("clears and rejects a mismatched OAuth state", async () => {
        const res = mockRes();

        await expect(
            linkedinCallbackController(
                {
                    user: authedUser,
                    query: { code: "auth-code", state: "query-state" },
                    cookies: { [LINKEDIN_STATE_COOKIE]: "cookie-state" },
                } as unknown as Request,
                res,
            ),
        ).rejects.toThrow("Invalid OAuth state");

        expect(res.clearCookie).toHaveBeenCalledWith(
            LINKEDIN_STATE_COOKIE,
            expect.objectContaining({ httpOnly: true, path: "/" }),
        );
        expect(connectLinkedInAccountService).not.toHaveBeenCalled();
    });

    it("connects the LinkedIn account after validating state", async () => {
        const res = mockRes();

        await linkedinCallbackController(
            {
                user: authedUser,
                query: { code: "auth-code", state: "matching-state" },
                cookies: { [LINKEDIN_STATE_COOKIE]: "matching-state" },
            } as unknown as Request,
            res,
        );

        expect(connectLinkedInAccountService).toHaveBeenCalledWith({
            userId: "user-id",
            code: "auth-code",
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "LinkedIn account connected successfully",
        });
    });
});
