import request from "supertest";
import { describe, expect, it } from "vitest";
import {
    githubProvider as provider,
    useGitHubTestEnvironment,
} from "./githubTestUtils";

const harness = useGitHubTestEnvironment();

describe("GitHub OAuth API contract", () => {
    it("requires authentication for connect and callback", async () => {
        const app = harness.getApp();
        const connect = await request(app).get(
            `/api/v1/identity/account/${provider.route}/connect`,
        );
        const callback = await request(app).get(
            `/api/v1/identity/account/${provider.route}/callback?code=code&state=state`,
        );

        expect(connect.status).toBe(401);
        expect(connect.body).toEqual({ message: expect.any(String) });
        expect(callback.status).toBe(401);
        expect(callback.body).toEqual({ message: expect.any(String) });
    });

    it("returns a redirect and HttpOnly state cookie from connect", async () => {
        const { agent } = await harness.registerVerifiedUser();
        const { response, authorizationUrl, state } =
            await harness.beginOAuth(agent);

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(authorizationUrl);
        expect(
            new URL(authorizationUrl).origin +
                new URL(authorizationUrl).pathname,
        ).toBe(provider.authorizationEndpoint);
        expect(new URL(authorizationUrl).searchParams.get("state")).toBe(state);
        expect(response.headers["set-cookie"]).toEqual(
            expect.arrayContaining([
                expect.stringContaining("github_oauth_state="),
                expect.stringContaining("HttpOnly"),
            ]),
        );
    });

    it("returns a JSON 400 response when the user denies authorization", async () => {
        const { agent } = await harness.registerVerifiedUser();
        const response = await agent
            .get(`/api/v1/identity/account/${provider.route}/callback`)
            .query({ error: "access_denied" });

        expect(response.status).toBe(400);
        expect(response.headers["content-type"]).toMatch(/json/);
        expect(response.body.message).toBe(
            "GitHub authorization was cancelled or denied",
        );
    });
});
