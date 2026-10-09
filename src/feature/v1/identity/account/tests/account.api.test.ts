import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AccountProvider } from "../types/account.enum";

vi.mock("../../../../../common/utils/sendVerificationEmail", () => ({
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../../../common/utils/sendWelcomeEmail", () => ({
    sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}));

process.env.JWT_SECRET = "test-secret";
process.env.NODE_ENV = "test";

let replSet: MongoMemoryReplSet;
let app: typeof import("../../../../../app").default;
let AccountModel: typeof import("../account.model").default;
let sendVerificationEmail: ReturnType<typeof vi.fn>;

const registerAndAuthenticate = async () => {
    const agent = request.agent(app);
    const registerResponse = await agent
        .post("/api/v1/identity/auth/register")
        .send({
            username: "accountapi",
            givenname: "Account",
            surname: "Api",
            email: "accountapi@gmail.com",
            password: "Password1",
            confirmPassword: "Password1",
        });
    expect(registerResponse.status).toBe(201);

    const calls = sendVerificationEmail.mock.calls;
    const token = calls[calls.length - 1][2] as string;
    const verifyResponse = await agent.get(
        `/api/v1/identity/auth/verify-email?token=${token}`,
    );
    expect(verifyResponse.status).toBe(200);

    return { agent, userId: registerResponse.body.data.userId as string };
};

const createAccount = (userId: string) =>
    AccountModel.create({
        userId,
        provider: AccountProvider.FACEBOOK,
        providerAccountId: "facebook-external-id",
        username: "facebook-user",
        email: "facebook@example.com",
        avatarUrl: "https://example.com/facebook.png",
        profileUrl: "https://facebook.com/facebook-user",
        accessToken: "secret-access-token",
        refreshToken: "secret-refresh-token",
        scopes: ["email", "public_profile"],
    });

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGO_URI = replSet.getUri();
    await mongoose.connect(process.env.MONGO_URI);

    app = (await import("../../../../../app")).default;
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    AccountModel = (await import("../account.model")).default;
    sendVerificationEmail = (
        await import("../../../../../common/utils/sendVerificationEmail")
    ).sendVerificationEmail as unknown as ReturnType<typeof vi.fn>;
}, 60_000);

afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
});

beforeEach(async () => {
    vi.clearAllMocks();
    for (const collection of Object.values(mongoose.connection.collections)) {
        await collection.deleteMany({});
    }
});

describe("Account API contract", () => {
    it("returns an authentication error body when listing accounts without a session", async () => {
        const response = await request(app).get("/api/v1/identity/account");

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ message: expect.any(String) });
    });

    it("returns the account list contract without credential fields", async () => {
        const { agent, userId } = await registerAndAuthenticate();
        await createAccount(userId);

        const response = await agent.get("/api/v1/identity/account");

        expect(response.status).toBe(200);
        expect(response.headers["content-type"]).toMatch(/json/);
        expect(response.body).toEqual({
            message: "Fetched accounts successfully",
            data: [
                {
                    id: expect.any(String),
                    provider: AccountProvider.FACEBOOK,
                    providerAccountId: "facebook-external-id",
                    username: "facebook-user",
                    email: "facebook@example.com",
                    avatarUrl: "https://example.com/facebook.png",
                    profileUrl: "https://facebook.com/facebook-user",
                    scopes: ["email", "public_profile"],
                    createdAt: expect.any(String),
                    updatedAt: expect.any(String),
                },
            ],
        });
        expect(JSON.stringify(response.body)).not.toContain(
            "secret-access-token",
        );
        expect(JSON.stringify(response.body)).not.toContain(
            "secret-refresh-token",
        );
    });

    it("returns the account contract for a provider and a 400 for unsupported providers", async () => {
        const { agent, userId } = await registerAndAuthenticate();
        await createAccount(userId);

        const response = await agent.get(
            `/api/v1/identity/account/${AccountProvider.FACEBOOK}`,
        );
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            message: "Fetched account successfully",
            data: expect.objectContaining({
                id: expect.any(String),
                provider: AccountProvider.FACEBOOK,
                providerAccountId: "facebook-external-id",
            }),
        });

        const invalidResponse = await agent.get(
            "/api/v1/identity/account/not-a-provider",
        );
        expect(invalidResponse.status).toBe(400);
        expect(invalidResponse.body).toEqual({
            message: "Invalid account provider",
        });
    });

    it("returns a successful disconnect response and no longer returns the account", async () => {
        const { agent, userId } = await registerAndAuthenticate();
        await createAccount(userId);

        const deleteResponse = await agent.delete(
            `/api/v1/identity/account/${AccountProvider.FACEBOOK}`,
        );
        expect(deleteResponse.status).toBe(200);
        expect(deleteResponse.body).toEqual({
            message: "Account disconnected successfully",
        });

        const getResponse = await agent.get(
            `/api/v1/identity/account/${AccountProvider.FACEBOOK}`,
        );
        expect(getResponse.status).toBe(404);
        expect(getResponse.body).toEqual({
            message: "facebook account not found",
        });
    });
});
