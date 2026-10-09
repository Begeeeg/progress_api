import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../identity/account/account.service", () => ({
    createAccountService: vi.fn(),
}));

vi.mock("../facebook.oauth", () => ({
    exchangeCodeForAccessToken: vi.fn(),
    getFacebookUser: vi.fn(),
}));

import * as accountService from "../../../identity/account/account.service";
import { AccountProvider } from "../../../identity/account/types/account.enum";
import {
    exchangeCodeForAccessToken,
    getFacebookUser,
} from "../facebook.oauth";
import { connectFacebookAccountService } from "../facebook.service";

describe("connectFacebookAccountService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("stores the Facebook account profile with the expected fields", async () => {
        vi.mocked(exchangeCodeForAccessToken).mockResolvedValue({
            access_token: "access-token",
            token_type: "bearer",
            expires_in: 3600,
            scope: "email,public_profile",
            refresh_token: "refresh-token",
        });
        vi.mocked(getFacebookUser).mockResolvedValue({
            id: "facebook-user-id",
            name: "Facebook User",
            email: "user@example.com",
            picture: { data: { url: "https://example.com/avatar.png" } },
            link: "https://facebook.com/facebook-user-id",
        });
        vi.mocked(accountService.createAccountService).mockResolvedValue(
            {} as never,
        );

        await connectFacebookAccountService({
            userId: "user-id",
            code: "auth-code",
        });

        expect(exchangeCodeForAccessToken).toHaveBeenCalledWith("auth-code");
        expect(getFacebookUser).toHaveBeenCalledWith("access-token");
        expect(accountService.createAccountService).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "user-id",
                provider: AccountProvider.FACEBOOK,
                providerAccountId: "facebook-user-id",
                username: "Facebook User",
                email: "user@example.com",
                avatarUrl: "https://example.com/avatar.png",
                profileUrl: "https://facebook.com/facebook-user-id",
                accessToken: "access-token",
                refreshToken: "refresh-token",
                scopes: ["email", "public_profile"],
                tokenExpiresAt: expect.any(Date),
            }),
        );
    });

    it("falls back to a generated username and nulls missing optional fields", async () => {
        vi.mocked(exchangeCodeForAccessToken).mockResolvedValue({
            access_token: "access-token",
            token_type: "bearer",
        });
        vi.mocked(getFacebookUser).mockResolvedValue({
            id: "facebook-user-id",
            first_name: "Jane",
            last_name: "Doe",
            email: null,
        });
        vi.mocked(accountService.createAccountService).mockResolvedValue(
            {} as never,
        );

        await connectFacebookAccountService({
            userId: "user-id",
            code: "auth-code",
        });

        expect(accountService.createAccountService).toHaveBeenCalledWith(
            expect.objectContaining({
                username: "Jane Doe",
                email: null,
                avatarUrl: null,
                profileUrl: null,
                refreshToken: null,
                tokenExpiresAt: null,
                scopes: [],
            }),
        );
    });

    it("uses null when no profile name or name parts are returned", async () => {
        vi.mocked(exchangeCodeForAccessToken).mockResolvedValue({
            access_token: "access-token",
            token_type: "bearer",
        });
        vi.mocked(getFacebookUser).mockResolvedValue({
            id: "facebook-user-id",
        });
        vi.mocked(accountService.createAccountService).mockResolvedValue(
            {} as never,
        );

        await connectFacebookAccountService({
            userId: "user-id",
            code: "auth-code",
        });

        expect(accountService.createAccountService).toHaveBeenCalledWith(
            expect.objectContaining({ username: null }),
        );
    });

    it("uses null when Facebook returns an empty profile name", async () => {
        vi.mocked(exchangeCodeForAccessToken).mockResolvedValue({
            access_token: "access-token",
            token_type: "bearer",
        });
        vi.mocked(getFacebookUser).mockResolvedValue({
            id: "facebook-user-id",
            name: "",
        });
        vi.mocked(accountService.createAccountService).mockResolvedValue(
            {} as never,
        );

        await connectFacebookAccountService({
            userId: "user-id",
            code: "auth-code",
        });

        expect(accountService.createAccountService).toHaveBeenCalledWith(
            expect.objectContaining({ username: null }),
        );
    });
});
