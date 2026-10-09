import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    buildGitHubAuthorizationUrl,
    exchangeCodeForAccessToken,
    getGitHubEmails,
    getGitHubUser,
} from "../github.oauth";
import {
    GITHUB_API_URL,
    GITHUB_API_VERSION,
    GITHUB_AUTHORIZE_URL,
    GITHUB_CALLBACK_URL,
    GITHUB_TOKEN_URL,
} from "../utils/githubConnect";

describe("github.oauth", () => {
    beforeEach(() => {
        vi.stubEnv("GITHUB_CLIENT_ID", "github-client-id");
        vi.stubEnv("GITHUB_CLIENT_SECRET", "github-client-secret");
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("builds a GitHub authorization URL containing state and requested scopes", () => {
        const url = new URL(buildGitHubAuthorizationUrl("opaque-state"));

        expect(url.origin + url.pathname).toBe(GITHUB_AUTHORIZE_URL);
        expect(url.searchParams.get("client_id")).toBe("github-client-id");
        expect(url.searchParams.get("redirect_uri")).toBe(GITHUB_CALLBACK_URL);
        expect(url.searchParams.get("scope")).toBe("read:user user:email");
        expect(url.searchParams.get("state")).toBe("opaque-state");
    });

    it("exchanges an authorization code and returns the token response", async () => {
        const tokenResponse = {
            access_token: "access-token",
            token_type: "bearer",
            scope: "read:user,user:email",
            expires_in: 3600,
        };
        const fetchMock = vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify(tokenResponse), { status: 200 }),
        );

        await expect(exchangeCodeForAccessToken("auth-code")).resolves.toEqual(
            tokenResponse,
        );
        expect(fetchMock).toHaveBeenCalledWith(
            GITHUB_TOKEN_URL,
            expect.objectContaining({
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
            }),
        );
        expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
            client_id: "github-client-id",
            client_secret: "github-client-secret",
            code: "auth-code",
            redirect_uri: GITHUB_CALLBACK_URL,
        });
    });

    it("rejects a failed token exchange", async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ error: "bad_verification_code" }), {
                status: 400,
            }),
        );

        await expect(
            exchangeCodeForAccessToken("invalid-code"),
        ).rejects.toThrow("Failed to authenticate with GitHub");
    });

    it("retrieves the GitHub user with the expected authorization headers", async () => {
        const user = {
            id: 123,
            login: "octocat",
            avatar_url: "https://example.com/avatar.png",
            html_url: "https://github.com/octocat",
            email: null,
        };
        const fetchMock = vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify(user), { status: 200 }),
        );

        await expect(getGitHubUser("access-token")).resolves.toEqual(user);
        expect(fetchMock).toHaveBeenCalledWith(`${GITHUB_API_URL}/user`, {
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: expect.stringMatching(/^Bearer /),
                "X-GitHub-Api-Version": GITHUB_API_VERSION,
            },
        });
    });

    it("rejects a failed GitHub user lookup", async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response("unauthorized", { status: 401 }),
        );

        await expect(getGitHubUser("bad-token")).rejects.toThrow(
            "Failed to retrieve GitHub user",
        );
    });

    it("retrieves the GitHub email list", async () => {
        const emails = [
            {
                email: "octocat@example.com",
                primary: true,
                verified: true,
                visibility: "public",
            },
        ];
        const fetchMock = vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify(emails), { status: 200 }),
        );

        await expect(getGitHubEmails("access-token")).resolves.toEqual(emails);
        expect(fetchMock).toHaveBeenCalledWith(
            `${GITHUB_API_URL}/user/emails`,
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: expect.stringMatching(/^Bearer /),
                }),
            }),
        );
    });

    it("rejects a failed GitHub email lookup", async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response("forbidden", { status: 403 }),
        );

        await expect(getGitHubEmails("bad-token")).rejects.toThrow(
            "Failed to retrieve GitHub email addresses",
        );
    });
});
