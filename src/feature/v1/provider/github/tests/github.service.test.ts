import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../identity/account/account.service", () => ({
    createAccountService: vi.fn(),
}));

vi.mock("../github.oauth", () => ({
    exchangeCodeForAccessToken: vi.fn(),
    getGitHubEmails: vi.fn(),
    getGitHubUser: vi.fn(),
}));

import * as accountService from "../../../identity/account/account.service";
import { AccountProvider } from "../../../identity/account/types/account.enum";
import {
    exchangeCodeForAccessToken,
    getGitHubEmails,
    getGitHubUser,
} from "../github.oauth";
import { connectGitHubAccountService } from "../github.service";

describe("connectGitHubAccountService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(exchangeCodeForAccessToken).mockResolvedValue({
            access_token: "access-token",
            token_type: "bearer",
            scope: "read:user,user:email",
            expires_in: 3600,
            refresh_token: "refresh-token",
        });
        vi.mocked(getGitHubUser).mockResolvedValue({
            id: 123,
            login: "octocat",
            avatar_url: "https://example.com/avatar.png",
            html_url: "https://github.com/octocat",
            email: "fallback@example.com",
        });
        vi.mocked(getGitHubEmails).mockResolvedValue([
            {
                email: "primary@example.com",
                primary: true,
                verified: true,
                visibility: "public",
            },
        ]);
    });

    it("stores the primary verified email and GitHub account details", async () => {
        vi.mocked(accountService.createAccountService).mockResolvedValue({
            id: "account-id",
        } as never);

        await connectGitHubAccountService({
            userId: "user-id",
            code: "auth-code",
        });

        expect(exchangeCodeForAccessToken).toHaveBeenCalledWith("auth-code");
        expect(getGitHubUser).toHaveBeenCalledWith("access-token");
        expect(getGitHubEmails).toHaveBeenCalledWith("access-token");
        expect(accountService.createAccountService).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "user-id",
                provider: AccountProvider.GITHUB,
                providerAccountId: "123",
                username: "octocat",
                email: "primary@example.com",
                avatarUrl: "https://example.com/avatar.png",
                profileUrl: "https://github.com/octocat",
                accessToken: "access-token",
                refreshToken: "refresh-token",
                scopes: ["read:user", "user:email"],
                tokenExpiresAt: expect.any(Date),
            }),
        );
    });

    it("falls back to the profile email when no primary verified email exists", async () => {
        vi.mocked(getGitHubEmails).mockResolvedValue([
            {
                email: "unverified@example.com",
                primary: true,
                verified: false,
                visibility: null,
            },
        ]);
        vi.mocked(accountService.createAccountService).mockResolvedValue(
            {} as never,
        );

        await connectGitHubAccountService({
            userId: "user-id",
            code: "auth-code",
        });

        expect(accountService.createAccountService).toHaveBeenCalledWith(
            expect.objectContaining({ email: "fallback@example.com" }),
        );
    });

    it("uses null for email and optional token metadata when unavailable", async () => {
        vi.mocked(getGitHubUser).mockResolvedValue({
            id: 123,
            login: "octocat",
            avatar_url: "https://example.com/avatar.png",
            html_url: "https://github.com/octocat",
            email: null,
        });
        vi.mocked(getGitHubEmails).mockResolvedValue([]);
        vi.mocked(exchangeCodeForAccessToken).mockResolvedValue({
            access_token: "access-token",
            token_type: "bearer",
            scope: "",
        });
        vi.mocked(accountService.createAccountService).mockResolvedValue(
            {} as never,
        );

        await connectGitHubAccountService({
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
});
