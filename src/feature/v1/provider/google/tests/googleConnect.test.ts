import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    getGoogleCallbackUrl,
    getGoogleClientId,
    getGoogleClientSecret,
    GOOGLE_AUTHORIZE_URL,
    GOOGLE_CALLBACK_URL,
    GOOGLE_STATE_COOKIE,
    GOOGLE_TOKEN_URL,
    GOOGLE_USERINFO_URL,
} from "../utils/googleConnect";

describe("googleConnect", () => {
    beforeEach(() => {
        vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
        vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
        vi.stubEnv("GOOGLE_CALLBACK_URL", "https://app.example.com/google/callback");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("returns configured credentials and callback URL", () => {
        expect(getGoogleClientId()).toBe("google-client-id");
        expect(getGoogleClientSecret()).toBe("google-client-secret");
        expect(getGoogleCallbackUrl()).toBe("https://app.example.com/google/callback");
    });

    it.each([
        ["GOOGLE_CLIENT_ID", getGoogleClientId],
        ["GOOGLE_CLIENT_SECRET", getGoogleClientSecret],
    ])("throws if %s is not configured", (name, getter) => {
        vi.stubEnv(name, "");
        expect(getter).toThrow(`${name} is not configured`);
    });

    it("uses the default callback URL when none is configured", () => {
        delete process.env.GOOGLE_CALLBACK_URL;
        expect(getGoogleCallbackUrl()).toBe(GOOGLE_CALLBACK_URL);
    });

    it("exports Google endpoints and the state-cookie name", () => {
        expect(GOOGLE_AUTHORIZE_URL).toBe("https://accounts.google.com/o/oauth2/v2/auth");
        expect(GOOGLE_TOKEN_URL).toBe("https://oauth2.googleapis.com/token");
        expect(GOOGLE_USERINFO_URL).toBe("https://openidconnect.googleapis.com/v1/userinfo");
        expect(GOOGLE_CALLBACK_URL).toBe(
            "http://localhost:5000/api/v1/identity/account/google/callback",
        );
        expect(GOOGLE_STATE_COOKIE).toBe("google_oauth_state");
    });
});
