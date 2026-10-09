import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    getGitHubApiUrl,
    getGitHubApiVersion,
    getGitHubAuthorizeUrl,
    getGitHubCallbackUrl,
    getGitHubClientId,
    getGitHubClientSecret,
    getGitHubTokenUrl,
    GITHUB_API_URL,
    GITHUB_API_VERSION,
    GITHUB_AUTHORIZE_URL,
    GITHUB_CALLBACK_URL,
    GITHUB_STATE_COOKIE,
    GITHUB_TOKEN_URL,
} from "../utils/githubConnect";

describe("githubConnect", () => {
    beforeEach(() => {
        vi.stubEnv("GITHUB_CLIENT_ID", "github-client-id");
        vi.stubEnv("GITHUB_CLIENT_SECRET", "github-client-secret");
        vi.stubEnv("GITHUB_AUTHORIZE_URL", "https://github.example.com/authorize");
        vi.stubEnv("GITHUB_TOKEN_URL", "https://github.example.com/token");
        vi.stubEnv("GITHUB_API_URL", "https://github.example.com/api");
        vi.stubEnv("GITHUB_API_VERSION", "2026-01-01");
        vi.stubEnv("GITHUB_CALLBACK_URL", "https://app.example.com/github/callback");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("returns configured OAuth and API settings", () => {
        expect(getGitHubClientId()).toBe("github-client-id");
        expect(getGitHubClientSecret()).toBe("github-client-secret");
        expect(getGitHubAuthorizeUrl()).toBe("https://github.example.com/authorize");
        expect(getGitHubTokenUrl()).toBe("https://github.example.com/token");
        expect(getGitHubApiUrl()).toBe("https://github.example.com/api");
        expect(getGitHubApiVersion()).toBe("2026-01-01");
        expect(getGitHubCallbackUrl()).toBe("https://app.example.com/github/callback");
    });

    it.each([
        ["GITHUB_CLIENT_ID", getGitHubClientId],
        ["GITHUB_CLIENT_SECRET", getGitHubClientSecret],
        ["GITHUB_AUTHORIZE_URL", getGitHubAuthorizeUrl],
        ["GITHUB_TOKEN_URL", getGitHubTokenUrl],
        ["GITHUB_API_URL", getGitHubApiUrl],
        ["GITHUB_API_VERSION", getGitHubApiVersion],
        ["GITHUB_CALLBACK_URL", getGitHubCallbackUrl],
    ])("throws if %s is not configured", (name, getter) => {
        vi.stubEnv(name, "");
        expect(getter).toThrow(`${name} is not configured`);
    });

    it("exports the default GitHub endpoints and state-cookie name", () => {
        expect(GITHUB_AUTHORIZE_URL).toBe("https://github.com/login/oauth/authorize");
        expect(GITHUB_TOKEN_URL).toBe("https://github.com/login/oauth/access_token");
        expect(GITHUB_API_URL).toBe("https://api.github.com");
        expect(GITHUB_API_VERSION).toBe("2026-03-10");
        expect(GITHUB_CALLBACK_URL).toBe(
            "http://localhost:5000/api/v1/identity/account/github/callback",
        );
        expect(GITHUB_STATE_COOKIE).toBe("github_oauth_state");
    });
});
