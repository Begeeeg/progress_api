import { afterAll, beforeAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import app from "../../../../../app.js";
import AccountModel from "../../../identity/account/account.model.js";
import { AccountProvider } from "../../../identity/account/types/account.enum";
import { sendVerificationEmail } from "../../../../../common/utils/sendVerificationEmail.js";

vi.mock("../../../../../common/utils/sendVerificationEmail", () => ({
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../../../common/utils/sendWelcomeEmail", () => ({
    sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}));

process.env.JWT_SECRET = "linkedin-oauth-test-secret";
process.env.NODE_ENV = "test";
process.env.LINKEDIN_CLIENT_ID = "linkedin-test-client";
process.env.LINKEDIN_CLIENT_SECRET = "linkedin-test-secret";
process.env.LINKEDIN_CALLBACK_URL =
    "http://localhost:5000/api/v1/identity/account/linkedin/callback";

export const linkedinProvider = {
    provider: AccountProvider.LINKEDIN,
    route: "linkedin",
    authorizationEndpoint: "https://www.linkedin.com/oauth/v2/authorization",
    externalAccountId: "linkedin-external-user",
};

export const useLinkedInTestEnvironment = () => {
    let replSet: MongoMemoryReplSet;
    let userSequence = 0;

    beforeAll(async () => {
        replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        process.env.MONGO_URI = replSet.getUri();
        await mongoose.connect(process.env.MONGO_URI);
        await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    }, 60_000);

    afterAll(async () => {
        await mongoose.disconnect();
        await replSet.stop();
    });

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.unstubAllGlobals();
        for (const collection of Object.values(mongoose.connection.collections)) {
            await collection.deleteMany({});
        }
    });

    const registerVerifiedUser = async () => {
        userSequence += 1;
        const agent = request.agent(app);
        const response = await agent.post("/api/v1/identity/auth/register").send({
            username: `linkedinuser${userSequence}`,
            givenname: "LinkedIn",
            surname: "Tester",
            email: `linkedinuser${userSequence}@gmail.com`,
            password: "Password1",
            confirmPassword: "Password1",
        });
        if (response.status !== 201) {
            throw new Error(`LinkedIn test user registration failed: ${JSON.stringify(response.body)}`);
        }

        const calls = vi.mocked(sendVerificationEmail).mock.calls;
        const token = calls[calls.length - 1]?.[2] as string;
        const verification = await agent.get(
            `/api/v1/identity/auth/verify-email?token=${token}`,
        );
        if (verification.status !== 200) {
            throw new Error(`LinkedIn test user verification failed: ${JSON.stringify(verification.body)}`);
        }

        return { agent, userId: response.body.data.userId as string };
    };

    const mockOAuthResponses = () => {
        vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
            const url = String(input);
            if (url.includes("www.linkedin.com/oauth/v2/accessToken")) {
                return new Response(
                    JSON.stringify({
                        access_token: "linkedin-access-token",
                        token_type: "Bearer",
                        scope: "openid profile email",
                        expires_in: 3600,
                        refresh_token: "linkedin-refresh-token",
                    }),
                    { status: 200 },
                );
            }
            if (url.includes("api.linkedin.com/v2/userinfo")) {
                return new Response(
                    JSON.stringify({
                        sub: linkedinProvider.externalAccountId,
                        name: "LinkedIn OAuth User",
                        email: "linkedin@example.com",
                        email_verified: true,
                        picture: "https://example.com/linkedin.png",
                    }),
                    { status: 200 },
                );
            }
            throw new Error(`Unexpected LinkedIn OAuth request: ${url}`);
        }));
    };

    const beginOAuth = async (agent: ReturnType<typeof request.agent>) => {
        const response = await agent.get(
            "/api/v1/identity/account/linkedin/connect",
        );
        const authorizationUrl = response.headers.location as string;
        return {
            response,
            authorizationUrl,
            state: new URL(authorizationUrl).searchParams.get("state"),
        };
    };

    const completeOAuth = (
        agent: ReturnType<typeof request.agent>,
        state: string,
    ) =>
        agent
            .get("/api/v1/identity/account/linkedin/callback")
            .query({ code: "linkedin-test-code", state });

    return {
        getApp: () => app,
        getAccountModel: () => AccountModel,
        registerVerifiedUser,
        mockOAuthResponses,
        beginOAuth,
        completeOAuth,
    };
};
