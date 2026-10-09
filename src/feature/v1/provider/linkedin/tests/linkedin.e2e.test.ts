import { describe, expect, it } from "vitest";
import {
    linkedinProvider as provider,
    useLinkedInTestEnvironment,
} from "./linkedinTestUtils";

const harness = useLinkedInTestEnvironment();

describe("LinkedIn OAuth E2E", () => {
    it("connects LinkedIn and exposes the account without its tokens", async () => {
        harness.mockOAuthResponses();
        const { agent, userId } = await harness.registerVerifiedUser();
        const connect = await harness.beginOAuth(agent);
        expect(connect.response.status).toBe(302);

        const callback = await harness.completeOAuth(agent, connect.state!);
        expect(callback.status).toBe(200);

        const accounts = await agent.get("/api/v1/identity/account");
        expect(accounts.status).toBe(200);
        expect(accounts.body.data).toEqual([
            expect.objectContaining({
                provider: provider.provider,
                providerAccountId: provider.externalAccountId,
            }),
        ]);
        expect(JSON.stringify(accounts.body)).not.toContain(
            "linkedin-access-token",
        );
        expect(JSON.stringify(accounts.body)).not.toContain(
            "linkedin-refresh-token",
        );
        await expect(
            harness.getAccountModel().countDocuments({
                userId,
                provider: provider.provider,
            }),
        ).resolves.toBe(1);
    });
});
