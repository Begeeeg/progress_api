import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../identity/account/account.service", () => ({
    createAccountService: vi.fn(),
}));

vi.mock("../google.oauth", () => ({
    exchangeCodeForAccessToken: vi.fn(),
    getGoogleUserInfo: vi.fn(),
}));

import * as accountService from "../../../identity/account/account.service";
import { AccountProvider } from "../../../identity/account/types/account.enum";
import {
    exchangeCodeForAccessToken,
    getGoogleUserInfo,
} from "../google.oauth";
import { connectGoogleAccountService } from "../google.service";

describe("connectGoogleAccountService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("exchanges the code and saves the verified Google account details", async () => {
        vi.mocked(exchangeCodeForAccessToken).mockResolvedValue({
            access_token: "access-token",
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "refresh-token",
            scope: "openid email profile",
        });
        vi.mocked(getGoogleUserInfo).mockResolvedValue({
            sub: "google-user-id",
            name: "Google User",
            email: "user@example.com",
            email_verified: true,
            picture: "https://example.com/avatar.png",
        });
        vi.mocked(accountService.createAccountService).mockResolvedValue({
            id: "account-id",
        } as never);
        const beforeCall = Date.now();

        await connectGoogleAccountService({
            userId: "user-id",
            code: "auth-code",
        });

        expect(exchangeCodeForAccessToken).toHaveBeenCalledWith("auth-code");
        expect(getGoogleUserInfo).toHaveBeenCalledWith("access-token");
        expect(accountService.createAccountService).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "user-id",
                provider: AccountProvider.GOOGLE,
                providerAccountId: "google-user-id",
                username: "Google User",
                email: "user@example.com",
                avatarUrl: "https://example.com/avatar.png",
                profileUrl: null,
                accessToken: "access-token",
                refreshToken: "refresh-token",
                scopes: ["openid", "email", "profile"],
                tokenExpiresAt: expect.any(Date),
            }),
        );
        const savedData = vi.mocked(accountService.createAccountService).mock
            .calls[0][0];
        expect(savedData.tokenExpiresAt!.getTime()).toBeGreaterThanOrEqual(
            beforeCall + 3600 * 1000,
        );
    });

    it("does not save an email Google has not verified", async () => {
        vi.mocked(exchangeCodeForAccessToken).mockResolvedValue({
            access_token: "access-token",
            token_type: "Bearer",
        });
        vi.mocked(getGoogleUserInfo).mockResolvedValue({
            sub: "google-user-id",
            email: "unverified@example.com",
            email_verified: false,
        });

        await connectGoogleAccountService({
            userId: "user-id",
            code: "auth-code",
        });

        expect(accountService.createAccountService).toHaveBeenCalledWith(
            expect.objectContaining({
                email: null,
                refreshToken: null,
                tokenExpiresAt: null,
                scopes: [],
            }),
        );
    });

    it("stores null when Google verifies no email address is returned", async () => {
        vi.mocked(exchangeCodeForAccessToken).mockResolvedValue({
            access_token: "access-token",
            token_type: "Bearer",
        });
        vi.mocked(getGoogleUserInfo).mockResolvedValue({
            sub: "google-user-id",
            email_verified: true,
        });

        await connectGoogleAccountService({
            userId: "user-id",
            code: "auth-code",
        });

        expect(accountService.createAccountService).toHaveBeenCalledWith(
            expect.objectContaining({ email: null }),
        );
    });
});
