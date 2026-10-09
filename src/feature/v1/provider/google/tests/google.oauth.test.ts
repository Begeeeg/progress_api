import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    buildGoogleAuthorizationUrl,
    exchangeCodeForAccessToken,
    getGoogleUserInfo,
} from "../google.oauth";
import {
    GOOGLE_TOKEN_URL,
    GOOGLE_USERINFO_URL,
} from "../utils/googleConnect";

describe("google.oauth", () => {
    beforeEach(() => {
        vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
        vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
        vi.stubEnv(
            "GOOGLE_CALLBACK_URL",
            "https://api.example.com/api/v1/identity/account/google/callback",
        );
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("builds a Google authorization URL with the OAuth state and scopes", () => {
        const url = new URL(buildGoogleAuthorizationUrl("opaque-state"));

        expect(url.origin + url.pathname).toBe(
            "https://accounts.google.com/o/oauth2/v2/auth",
        );
        expect(url.searchParams.get("client_id")).toBe("google-client-id");
        expect(url.searchParams.get("redirect_uri")).toBe(
            "https://api.example.com/api/v1/identity/account/google/callback",
        );
        expect(url.searchParams.get("response_type")).toBe("code");
        expect(url.searchParams.get("scope")).toBe("openid email profile");
        expect(url.searchParams.get("state")).toBe("opaque-state");
        expect(url.searchParams.get("access_type")).toBe("offline");
    });

    it("exchanges the authorization code and returns tokens", async () => {
        const fetchMock = vi.mocked(fetch).mockResolvedValue(
            new Response(
                JSON.stringify({
                    access_token: "access-token",
                    token_type: "Bearer",
                    expires_in: 3600,
                    scope: "openid email profile",
                }),
                { status: 200 },
            ),
        );

        await expect(exchangeCodeForAccessToken("auth-code")).resolves.toEqual({
            access_token: "access-token",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "openid email profile",
        });

        expect(fetchMock).toHaveBeenCalledWith(
            GOOGLE_TOKEN_URL,
            expect.objectContaining({
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }),
        );
        const options = fetchMock.mock.calls[0][1]!;
        const body = options.body as URLSearchParams;
        expect(body.get("code")).toBe("auth-code");
        expect(body.get("client_id")).toBe("google-client-id");
        expect(body.get("client_secret")).toBe("google-client-secret");
        expect(body.get("redirect_uri")).toBe(
            "https://api.example.com/api/v1/identity/account/google/callback",
        );
    });

    it("rejects a failed token exchange", async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ error: "invalid_grant" }), {
                status: 400,
            }),
        );

        await expect(
            exchangeCodeForAccessToken("invalid-code"),
        ).rejects.toThrow("Failed to authenticate with Google");
    });

    it("rejects a failed Google user info request", async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response("unauthorized", { status: 401 }),
        );

        await expect(getGoogleUserInfo("invalid-token")).rejects.toThrow(
            "Failed to retrieve Google user",
        );
    });

    it("retrieves the Google user profile using the bearer token", async () => {
        const userInfo = {
            sub: "google-user-id",
            name: "Google User",
            email: "user@example.com",
            email_verified: true,
            picture: "https://example.com/avatar.png",
        };
        const fetchMock = vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify(userInfo), { status: 200 }),
        );

        await expect(getGoogleUserInfo("access-token")).resolves.toEqual(
            userInfo,
        );
        expect(fetchMock).toHaveBeenCalledWith(GOOGLE_USERINFO_URL, {
            headers: { Authorization: "Bearer access-token" },
        });
    });

    it("rejects a Google user profile without a subject", async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ email: "user@example.com" }), {
                status: 200,
            }),
        );

        await expect(getGoogleUserInfo("access-token")).rejects.toThrow(
            "Invalid Google user response",
        );
    });
});
