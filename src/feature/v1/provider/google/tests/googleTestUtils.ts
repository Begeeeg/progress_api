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

process.env.JWT_SECRET = "google-oauth-test-secret";
process.env.NODE_ENV = "test";
process.env.GOOGLE_CLIENT_ID = "google-test-client";
process.env.GOOGLE_CLIENT_SECRET = "google-test-secret";
process.env.GOOGLE_CALLBACK_URL =
    "http://localhost:5000/api/v1/identity/account/google/callback";

export const googleProvider = {
    provider: AccountProvider.GOOGLE,
    route: "google",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    externalAccountId: "google-external-user",
};

export const useGoogleTestEnvironment = () => {
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
            username: `googleuser${userSequence}`,
            givenname: "Google",
            surname: "Tester",
            email: `googleuser${userSequence}@gmail.com`,
            password: "Password1",
            confirmPassword: "Password1",
        });
        if (response.status !== 201) {
            throw new Error(`Google test user registration failed: ${JSON.stringify(response.body)}`);
        }

        const calls = vi.mocked(sendVerificationEmail).mock.calls;
        const token = calls[calls.length - 1]?.[2] as string;
        const verification = await agent.get(
            `/api/v1/identity/auth/verify-email?token=${token}`,
        );
        if (verification.status !== 200) {
            throw new Error(`Google test user verification failed: ${JSON.stringify(verification.body)}`);
        }

        return { agent, userId: response.body.data.userId as string };
    };

    const mockOAuthResponses = () => {
        vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
            const url = String(input);
            if (url.includes("oauth2.googleapis.com/token")) {
                return new Response(
                    JSON.stringify({
                        access_token: "google-access-token",
                        token_type: "Bearer",
                        scope: "openid email profile",
                        expires_in: 3600,
                        refresh_token: "google-refresh-token",
                    }),
                    { status: 200 },
                );
            }
            if (url.includes("openidconnect.googleapis.com")) {
                return new Response(
                    JSON.stringify({
                        sub: googleProvider.externalAccountId,
                        name: "Google OAuth User",
                        email: "google@example.com",
                        email_verified: true,
                        picture: "https://example.com/google.png",
                    }),
                    { status: 200 },
                );
            }
            throw new Error(`Unexpected Google OAuth request: ${url}`);
        }));
    };

    const beginOAuth = async (agent: ReturnType<typeof request.agent>) => {
        const response = await agent.get(
            "/api/v1/identity/account/google/connect",
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
            .get("/api/v1/identity/account/google/callback")
            .query({ code: "google-test-code", state });

    return {
        getApp: () => app,
        getAccountModel: () => AccountModel,
        registerVerifiedUser,
        mockOAuthResponses,
        beginOAuth,
        completeOAuth,
    };
};
