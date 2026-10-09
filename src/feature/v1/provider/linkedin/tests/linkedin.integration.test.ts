import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    linkedinProvider as provider,
    useLinkedInTestEnvironment,
} from "./linkedinTestUtils";

const harness = useLinkedInTestEnvironment();

afterEach(() => {
    vi.restoreAllMocks();
});

describe("LinkedIn OAuth integration", () => {
    it("reports registration failures from its verified-user helper", async () => {
        const agent = {
            post: () => ({
                send: async () => ({ status: 400, body: { error: "invalid user" } }),
            }),
        };
        const agentSpy = vi
            .spyOn(request, "agent")
            .mockReturnValue(agent as unknown as ReturnType<typeof request.agent>);

        try {
            await expect(harness.registerVerifiedUser()).rejects.toThrow(
                "LinkedIn test user registration failed",
            );
        } finally {
            agentSpy.mockRestore();
        }
    });

    it("reports verification failures from its verified-user helper", async () => {
        const agent = {
            post: () => ({
                send: async () => {
                    return {
                        status: 201,
                        body: { data: { userId: "test-user-id" } },
                    };
                },
            }),
            get: async () => ({ status: 400, body: { error: "invalid token" } }),
        };
        const agentSpy = vi
            .spyOn(request, "agent")
            .mockReturnValue(agent as unknown as ReturnType<typeof request.agent>);

        try {
            await expect(harness.registerVerifiedUser()).rejects.toThrow(
                "LinkedIn test user verification failed",
            );
        } finally {
            agentSpy.mockRestore();
        }
    });

    it("rejects unexpected requests in its OAuth fetch mock", async () => {
        harness.mockOAuthResponses();

        await expect(fetch("https://unexpected.example.com")).rejects.toThrow(
            "Unexpected LinkedIn OAuth request",
        );
    });

    it("exchanges the authorization code and persists the connected account", async () => {
        expect(harness.getApp()).toBeDefined();
        harness.mockOAuthResponses();
        const { agent, userId } = await harness.registerVerifiedUser();
        const { response: connectResponse, authorizationUrl, state } =
            await harness.beginOAuth(agent);

        expect(connectResponse.status).toBe(302);
        expect(
            new URL(authorizationUrl).origin +
                new URL(authorizationUrl).pathname,
        ).toBe(provider.authorizationEndpoint);
        expect(state).toEqual(expect.any(String));
        expect(connectResponse.headers["set-cookie"]).toEqual(
            expect.arrayContaining([
                expect.stringContaining("linkedin_oauth_state="),
            ]),
        );

        const callbackResponse = await harness.completeOAuth(agent, state!);
        expect(callbackResponse.status).toBe(200);
        expect(callbackResponse.body).toEqual({
            message: "LinkedIn account connected successfully",
        });

        const savedAccount = await harness
            .getAccountModel()
            .findOne({ userId, provider: provider.provider })
            .select("+accessToken +refreshToken");
        expect(savedAccount).toMatchObject({
            providerAccountId: provider.externalAccountId,
            accessToken: "linkedin-access-token",
            refreshToken: "linkedin-refresh-token",
        });
    });
});
