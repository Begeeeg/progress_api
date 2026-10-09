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

process.env.JWT_SECRET = "facebook-oauth-test-secret";
process.env.NODE_ENV = "test";
process.env.FACEBOOK_CLIENT_ID = "facebook-test-client";
process.env.FACEBOOK_CLIENT_SECRET = "facebook-test-secret";
process.env.FACEBOOK_CALLBACK_URL =
    "http://localhost:5000/api/v1/identity/account/facebook/callback";

export const facebookProvider = {
    provider: AccountProvider.FACEBOOK,
    route: "facebook",
    authorizationEndpoint: "https://www.facebook.com/v19.0/dialog/oauth",
    externalAccountId: "facebook-external-user",
};

export const useFacebookTestEnvironment = () => {
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
            username: `facebookuser${userSequence}`,
            givenname: "Facebook",
            surname: "Tester",
            email: `facebookuser${userSequence}@gmail.com`,
            password: "Password1",
            confirmPassword: "Password1",
        });
        if (response.status !== 201) {
            throw new Error(`Facebook test user registration failed: ${JSON.stringify(response.body)}`);
        }

        const calls = vi.mocked(sendVerificationEmail).mock.calls;
        const token = calls[calls.length - 1]?.[2] as string;
        const verification = await agent.get(
            `/api/v1/identity/auth/verify-email?token=${token}`,
        );
        if (verification.status !== 200) {
            throw new Error(`Facebook test user verification failed: ${JSON.stringify(verification.body)}`);
        }

        return { agent, userId: response.body.data.userId as string };
    };

    const mockOAuthResponses = () => {
        vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
            const url = String(input);
            if (url.includes("graph.facebook.com/v19.0/oauth/access_token")) {
                return new Response(
                    JSON.stringify({
                        access_token: "facebook-access-token",
                        token_type: "Bearer",
                        scope: "email,public_profile",
                        expires_in: 3600,
                        refresh_token: "facebook-refresh-token",
                    }),
                    { status: 200 },
                );
            }
            if (url.includes("graph.facebook.com/v19.0/me")) {
                return new Response(
                    JSON.stringify({
                        id: facebookProvider.externalAccountId,
                        name: "Facebook OAuth User",
                        email: "facebook@example.com",
                        picture: {
                            data: { url: "https://example.com/facebook.png" },
                        },
                        link: "https://facebook.com/facebook-user",
                    }),
                    { status: 200 },
                );
            }
            throw new Error(`Unexpected Facebook OAuth request: ${url}`);
        }));
    };

    const beginOAuth = async (agent: ReturnType<typeof request.agent>) => {
        const response = await agent.get(
            "/api/v1/identity/account/facebook/connect",
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
            .get("/api/v1/identity/account/facebook/callback")
            .query({ code: "facebook-test-code", state });

    return {
        getApp: () => app,
        getAccountModel: () => AccountModel,
        registerVerifiedUser,
        mockOAuthResponses,
        beginOAuth,
        completeOAuth,
    };
};
