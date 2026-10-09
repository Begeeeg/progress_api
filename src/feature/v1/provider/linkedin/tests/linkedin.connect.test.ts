import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    getLinkedInCallbackUrl,
    getLinkedInClientId,
    getLinkedInClientSecret,
    LINKEDIN_AUTHORIZE_URL,
    LINKEDIN_CALLBACK_URL,
    LINKEDIN_STATE_COOKIE,
    LINKEDIN_TOKEN_URL,
    LINKEDIN_USERINFO_URL,
} from "../utils/linkedinConnect";

describe("linkedinConnect", () => {
    beforeEach(() => {
        vi.stubEnv("LINKEDIN_CLIENT_ID", "linkedin-client-id");
        vi.stubEnv("LINKEDIN_CLIENT_SECRET", "linkedin-client-secret");
        vi.stubEnv("LINKEDIN_CALLBACK_URL", "https://app.example.com/linkedin/callback");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("returns configured credentials and callback URL", () => {
        expect(getLinkedInClientId()).toBe("linkedin-client-id");
        expect(getLinkedInClientSecret()).toBe("linkedin-client-secret");
        expect(getLinkedInCallbackUrl()).toBe("https://app.example.com/linkedin/callback");
    });

    it.each([
        ["LINKEDIN_CLIENT_ID", getLinkedInClientId],
        ["LINKEDIN_CLIENT_SECRET", getLinkedInClientSecret],
    ])("throws if %s is not configured", (name, getter) => {
        vi.stubEnv(name, "");
        expect(getter).toThrow(`${name} is not configured`);
    });

    it("uses the default callback URL when none is configured", () => {
        delete process.env.LINKEDIN_CALLBACK_URL;
        expect(getLinkedInCallbackUrl()).toBe(LINKEDIN_CALLBACK_URL);
    });

    it("exports LinkedIn endpoints and the state-cookie name", () => {
        expect(LINKEDIN_AUTHORIZE_URL).toBe(
            "https://www.linkedin.com/oauth/v2/authorization",
        );
        expect(LINKEDIN_TOKEN_URL).toBe("https://www.linkedin.com/oauth/v2/accessToken");
        expect(LINKEDIN_USERINFO_URL).toBe("https://api.linkedin.com/v2/userinfo");
        expect(LINKEDIN_CALLBACK_URL).toBe(
            "http://localhost:5000/api/v1/identity/account/linkedin/callback",
        );
        expect(LINKEDIN_STATE_COOKIE).toBe("linkedin_oauth_state");
    });
});
