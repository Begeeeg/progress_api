import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../identity/account/account.service", () => ({
    createAccountService: vi.fn(),
}));

vi.mock("../linkedin.oauth", () => ({
    exchangeCodeForAccessToken: vi.fn(),
    getLinkedInUserInfo: vi.fn(),
}));

import * as accountService from "../../../identity/account/account.service";
import { AccountProvider } from "../../../identity/account/types/account.enum";
import {
    exchangeCodeForAccessToken,
    getLinkedInUserInfo,
} from "../linkedin.oauth";
import { connectLinkedInAccountService } from "../linkedin.service";

describe("connectLinkedInAccountService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("stores verified LinkedIn profile data and token details", async () => {
        vi.mocked(exchangeCodeForAccessToken).mockResolvedValue({
            access_token: "access-token",
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "refresh-token",
            scope: "openid profile email",
        });
        vi.mocked(getLinkedInUserInfo).mockResolvedValue({
            sub: "linkedin-user-id",
            name: "LinkedIn User",
            email: "user@example.com",
            email_verified: true,
            picture: "https://example.com/avatar.png",
        });
        vi.mocked(accountService.createAccountService).mockResolvedValue(
            {} as never,
        );

        await connectLinkedInAccountService({
            userId: "user-id",
            code: "auth-code",
        });

        expect(exchangeCodeForAccessToken).toHaveBeenCalledWith("auth-code");
        expect(getLinkedInUserInfo).toHaveBeenCalledWith("access-token");
        expect(accountService.createAccountService).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "user-id",
                provider: AccountProvider.LINKEDIN,
                providerAccountId: "linkedin-user-id",
                username: "LinkedIn User",
                email: "user@example.com",
                avatarUrl: "https://example.com/avatar.png",
                profileUrl: null,
                accessToken: "access-token",
                refreshToken: "refresh-token",
                scopes: ["openid", "profile", "email"],
                tokenExpiresAt: expect.any(Date),
            }),
        );
    });

    it("builds a username from name parts and excludes an unverified email", async () => {
        vi.mocked(exchangeCodeForAccessToken).mockResolvedValue({
            access_token: "access-token",
            token_type: "Bearer",
        });
        vi.mocked(getLinkedInUserInfo).mockResolvedValue({
            sub: "linkedin-user-id",
            given_name: "Jane",
            family_name: "Doe",
            email: "unverified@example.com",
            email_verified: false,
        });
        vi.mocked(accountService.createAccountService).mockResolvedValue(
            {} as never,
        );

        await connectLinkedInAccountService({
            userId: "user-id",
            code: "auth-code",
        });

        expect(accountService.createAccountService).toHaveBeenCalledWith(
            expect.objectContaining({
                username: "Jane Doe",
                email: null,
                avatarUrl: null,
                refreshToken: null,
                tokenExpiresAt: null,
                scopes: [],
            }),
        );
    });

    it("uses null for an empty fallback name and a verified-but-missing email", async () => {
        vi.mocked(exchangeCodeForAccessToken).mockResolvedValue({
            access_token: "access-token",
            token_type: "Bearer",
        });
        vi.mocked(getLinkedInUserInfo).mockResolvedValue({
            sub: "linkedin-user-id",
            email_verified: true,
        });
        vi.mocked(accountService.createAccountService).mockResolvedValue(
            {} as never,
        );

        await connectLinkedInAccountService({
            userId: "user-id",
            code: "auth-code",
        });

        expect(accountService.createAccountService).toHaveBeenCalledWith(
            expect.objectContaining({
                username: null,
                email: null,
            }),
        );
    });
});
