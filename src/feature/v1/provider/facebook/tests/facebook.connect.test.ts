import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    getFacebookCallbackUrl,
    getFacebookClientId,
    getFacebookClientSecret,
    FACEBOOK_AUTHORIZE_URL,
    FACEBOOK_CALLBACK_URL,
    FACEBOOK_GRAPH_URL,
    FACEBOOK_STATE_COOKIE,
    FACEBOOK_TOKEN_URL,
} from "../utils/facebookConnect";

describe("facebookConnect", () => {
    beforeEach(() => {
        vi.stubEnv("FACEBOOK_CLIENT_ID", "facebook-client-id");
        vi.stubEnv("FACEBOOK_CLIENT_SECRET", "facebook-client-secret");
        vi.stubEnv("FACEBOOK_CALLBACK_URL", "https://app.example.com/facebook/callback");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("returns configured credentials and callback URL", () => {
        expect(getFacebookClientId()).toBe("facebook-client-id");
        expect(getFacebookClientSecret()).toBe("facebook-client-secret");
        expect(getFacebookCallbackUrl()).toBe("https://app.example.com/facebook/callback");
    });

    it.each([
        ["FACEBOOK_CLIENT_ID", getFacebookClientId],
        ["FACEBOOK_CLIENT_SECRET", getFacebookClientSecret],
    ])("throws if %s is not configured", (name, getter) => {
        vi.stubEnv(name, "");
        expect(getter).toThrow(`${name} is not configured`);
    });

    it("uses the default callback URL when none is configured", () => {
        delete process.env.FACEBOOK_CALLBACK_URL;
        expect(getFacebookCallbackUrl()).toBe(FACEBOOK_CALLBACK_URL);
    });

    it("exports Facebook endpoints and the state-cookie name", () => {
        expect(FACEBOOK_AUTHORIZE_URL).toBe(
            "https://www.facebook.com/v19.0/dialog/oauth",
        );
        expect(FACEBOOK_TOKEN_URL).toBe(
            "https://graph.facebook.com/v19.0/oauth/access_token",
        );
        expect(FACEBOOK_GRAPH_URL).toBe("https://graph.facebook.com/v19.0");
        expect(FACEBOOK_CALLBACK_URL).toBe(
            "http://localhost:5000/api/v1/identity/account/facebook/callback",
        );
        expect(FACEBOOK_STATE_COOKIE).toBe("facebook_oauth_state");
    });
});
