import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    buildFacebookAuthorizationUrl,
    exchangeCodeForAccessToken,
    getFacebookUser,
} from "../facebook.oauth";
import {
    FACEBOOK_AUTHORIZE_URL,
    FACEBOOK_GRAPH_URL,
    FACEBOOK_TOKEN_URL,
} from "../utils/facebookConnect";

describe("facebook.oauth", () => {
    beforeEach(() => {
        vi.stubEnv("FACEBOOK_CLIENT_ID", "facebook-client-id");
        vi.stubEnv("FACEBOOK_CLIENT_SECRET", "facebook-client-secret");
        vi.stubEnv(
            "FACEBOOK_CALLBACK_URL",
            "https://api.example.com/api/v1/identity/account/facebook/callback",
        );
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("builds a Facebook authorization URL with scopes and state", () => {
        const url = new URL(buildFacebookAuthorizationUrl("opaque-state"));

        expect(url.origin + url.pathname).toBe(FACEBOOK_AUTHORIZE_URL);
        expect(url.searchParams.get("client_id")).toBe("facebook-client-id");
        expect(url.searchParams.get("redirect_uri")).toBe(
            "https://api.example.com/api/v1/identity/account/facebook/callback",
        );
        expect(url.searchParams.get("scope")).toBe("email,public_profile");
        expect(url.searchParams.get("response_type")).toBe("code");
        expect(url.searchParams.get("state")).toBe("opaque-state");
    });

    it("exchanges a code for a Facebook access token", async () => {
        const tokenResponse = {
            access_token: "access-token",
            token_type: "bearer",
            expires_in: 3600,
            scope: "email,public_profile",
        };
        const fetchMock = vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify(tokenResponse), { status: 200 }),
        );

        await expect(exchangeCodeForAccessToken("auth-code")).resolves.toEqual(
            tokenResponse,
        );
        expect(fetchMock).toHaveBeenCalledWith(
            FACEBOOK_TOKEN_URL,
            expect.objectContaining({
                method: "POST",
                headers: {
                    Accept: "application/json",
                },
            }),
        );

        const options = fetchMock.mock.calls[0][1]!;
        const body = options.body as URLSearchParams;
        expect(body.get("code")).toBe("auth-code");
        expect(body.get("client_id")).toBe("facebook-client-id");
        expect(body.get("client_secret")).toBe("facebook-client-secret");
        expect(body.get("redirect_uri")).toBe(
            "https://api.example.com/api/v1/identity/account/facebook/callback",
        );
    });

    it("rejects a failed token exchange", async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ error: { message: "Error" } }), {
                status: 400,
            }),
        );

        await expect(
            exchangeCodeForAccessToken("invalid-code"),
        ).rejects.toThrow("Failed to authenticate with Facebook");
    });

    it("rejects a failed Facebook profile request", async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response("unauthorized", { status: 401 }),
        );

        await expect(getFacebookUser("invalid-token")).rejects.toThrow(
            "Failed to retrieve Facebook user",
        );
    });

    it("retrieves the Facebook profile using the bearer token", async () => {
        const profile = {
            id: "facebook-user-id",
            name: "Facebook User",
            email: "user@example.com",
            picture: { data: { url: "https://example.com/avatar.png" } },
            link: "https://facebook.com/facebook-user-id",
        };
        const fetchMock = vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify(profile), { status: 200 }),
        );

        await expect(getFacebookUser("access-token")).resolves.toEqual(profile);
        expect(fetchMock).toHaveBeenCalledWith(
            `${FACEBOOK_GRAPH_URL}/me?fields=id%2Cname%2Cemail%2Cpicture%7Burl%7D%2Clink`,
            {
                headers: { Authorization: expect.stringMatching(/^Bearer /) },
            },
        );
    });

    it("rejects an invalid Facebook profile response", async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ email: "user@example.com" }), {
                status: 200,
            }),
        );

        await expect(getFacebookUser("access-token")).rejects.toThrow(
            "Invalid Facebook user response",
        );
    });
});
