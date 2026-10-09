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

const registerAndAuthenticate = async (suffix = "") => {
    const agent = request.agent(app);
    const registerRes = await agent.post("/api/v1/identity/auth/register").send({
        username: `acct${suffix}`,
        givenname: "Account",
        surname: "User",
        email: `account${suffix}@gmail.com`,
        password: "Password1",
        confirmPassword: "Password1",
    });
    expect(registerRes.status).toBe(201);

    const calls = sendVerificationEmail.mock.calls;
    const verificationToken = calls[calls.length - 1][2] as string;
    const verificationRes = await agent.get(
        `/api/v1/identity/auth/verify-email?token=${verificationToken}`,
    );
    expect(verificationRes.status).toBe(200);

    return { agent, userId: registerRes.body.data.userId as string };
};

const createConnectedAccount = (userId: string, provider: AccountProvider) =>
    AccountModel.create({
        userId,
        provider,
        providerAccountId: `${provider}-external-id`,
        username: "connected-user",
        email: "connected@example.com",
        avatarUrl: "https://example.com/avatar.png",
        profileUrl: `https://${provider}.example.com/connected-user`,
        accessToken: "private-access-token",
        refreshToken: "private-refresh-token",
        scopes: ["profile", "email"],
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

describe("Account integration", () => {
    it("requires an authenticated user to list accounts", async () => {
        const response = await request(app).get("/api/v1/identity/account");
        expect(response.status).toBe(401);
    });

    it("lists connected accounts and does not expose OAuth tokens", async () => {
        const { agent, userId } = await registerAndAuthenticate();
        await createConnectedAccount(userId, AccountProvider.GITHUB);

        const response = await agent.get("/api/v1/identity/account");

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0]).toEqual(
            expect.objectContaining({
                provider: AccountProvider.GITHUB,
                providerAccountId: "github-external-id",
                username: "connected-user",
                email: "connected@example.com",
                scopes: ["profile", "email"],
            }),
        );
        expect(response.body.data[0]).not.toHaveProperty("accessToken");
        expect(response.body.data[0]).not.toHaveProperty("refreshToken");
    });

    it("gets and deletes an account by provider for its owner", async () => {
        const { agent, userId } = await registerAndAuthenticate();
        await createConnectedAccount(userId, AccountProvider.GOOGLE);

        const getResponse = await agent.get(
            `/api/v1/identity/account/${AccountProvider.GOOGLE}`,
        );
        expect(getResponse.status).toBe(200);
        expect(getResponse.body.data.provider).toBe(AccountProvider.GOOGLE);

        const deleteResponse = await agent.delete(
            `/api/v1/identity/account/${AccountProvider.GOOGLE}`,
        );
        expect(deleteResponse.status).toBe(200);
        expect(deleteResponse.body.message).toBe(
            "Account disconnected successfully",
        );
        expect(await AccountModel.countDocuments({ userId })).toBe(0);
    });

    it("does not let one user retrieve or delete another user's provider account", async () => {
        const owner = await registerAndAuthenticate("owner");
        const otherUser = await registerAndAuthenticate("other");
        await createConnectedAccount(owner.userId, AccountProvider.LINKEDIN);

        const getResponse = await otherUser.agent.get(
            `/api/v1/identity/account/${AccountProvider.LINKEDIN}`,
        );
        expect(getResponse.status).toBe(404);

        const deleteResponse = await otherUser.agent.delete(
            `/api/v1/identity/account/${AccountProvider.LINKEDIN}`,
        );
        expect(deleteResponse.status).toBe(404);
        expect(
            await AccountModel.countDocuments({ userId: owner.userId }),
        ).toBe(1);
    });
});
