import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    buildLinkedInAuthorizationUrl,
    exchangeCodeForAccessToken,
    getLinkedInUserInfo,
} from "../linkedin.oauth";
import {
    LINKEDIN_AUTHORIZE_URL,
    LINKEDIN_TOKEN_URL,
    LINKEDIN_USERINFO_URL,
} from "../utils/linkedinConnect";

describe("linkedin.oauth", () => {
    beforeEach(() => {
        vi.stubEnv("LINKEDIN_CLIENT_ID", "linkedin-client-id");
        vi.stubEnv("LINKEDIN_CLIENT_SECRET", "linkedin-client-secret");
        vi.stubEnv(
            "LINKEDIN_CALLBACK_URL",
            "https://api.example.com/api/v1/identity/account/linkedin/callback",
        );
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("builds an authorization URL with required OIDC scopes and state", () => {
        const url = new URL(buildLinkedInAuthorizationUrl("opaque-state"));

        expect(url.origin + url.pathname).toBe(LINKEDIN_AUTHORIZE_URL);
        expect(url.searchParams.get("client_id")).toBe("linkedin-client-id");
        expect(url.searchParams.get("redirect_uri")).toBe(
            "https://api.example.com/api/v1/identity/account/linkedin/callback",
        );
        expect(url.searchParams.get("response_type")).toBe("code");
        expect(url.searchParams.get("scope")).toBe("openid profile email");
        expect(url.searchParams.get("state")).toBe("opaque-state");
    });

    it("exchanges an authorization code for access tokens", async () => {
        const tokenResponse = {
            access_token: "access-token",
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "refresh-token",
            scope: "openid profile email",
        };
        const fetchMock = vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify(tokenResponse), { status: 200 }),
        );

        await expect(
            exchangeCodeForAccessToken("auth-code"),
        ).resolves.toEqual(tokenResponse);
        expect(fetchMock).toHaveBeenCalledWith(
            LINKEDIN_TOKEN_URL,
            expect.objectContaining({
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }),
        );
        const options = fetchMock.mock.calls[0][1]!;
        const body = options.body as URLSearchParams;
        expect(body.get("client_id")).toBe("linkedin-client-id");
        expect(body.get("client_secret")).toBe("linkedin-client-secret");
        expect(body.get("code")).toBe("auth-code");
        expect(body.get("grant_type")).toBe("authorization_code");
        expect(body.get("redirect_uri")).toBe(
            "https://api.example.com/api/v1/identity/account/linkedin/callback",
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
        ).rejects.toThrow("Failed to authenticate with LinkedIn");
    });

    it("retrieves LinkedIn user info with the access token", async () => {
        const profile = {
            sub: "linkedin-user-id",
            name: "LinkedIn User",
            email: "user@example.com",
            email_verified: true,
            picture: "https://example.com/avatar.png",
        };
        const fetchMock = vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify(profile), { status: 200 }),
        );

        await expect(getLinkedInUserInfo("access-token")).resolves.toEqual(
            profile,
        );
        expect(fetchMock).toHaveBeenCalledWith(LINKEDIN_USERINFO_URL, {
            headers: { Authorization: expect.stringMatching(/^Bearer /) },
        });
    });

    it("rejects a failed LinkedIn profile lookup", async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response("unauthorized", { status: 401 }),
        );

        await expect(
            getLinkedInUserInfo("invalid-token"),
        ).rejects.toThrow("Failed to retrieve LinkedIn user");
    });

    it("rejects a profile response without a subject identifier", async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ email: "user@example.com" }), {
                status: 200,
            }),
        );

        await expect(
            getLinkedInUserInfo("access-token"),
        ).rejects.toThrow("Invalid LinkedIn user response");
    });
});
