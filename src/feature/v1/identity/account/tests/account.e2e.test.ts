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

const registerAndVerify = async () => {
    const agent = request.agent(app);
    const registerResponse = await agent
        .post("/api/v1/identity/auth/register")
        .send({
            username: "accountjourney",
            givenname: "Account",
            surname: "Journey",
            email: "accountjourney@gmail.com",
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

describe("Account E2E journey", () => {
    it("registers and verifies a user, lists connected providers, fetches one account, disconnects it, and confirms removal", async () => {
        const { agent, userId } = await registerAndVerify();

        const emptyListResponse = await agent.get(
            "/api/v1/identity/account",
        );
        expect(emptyListResponse.status).toBe(200);
        expect(emptyListResponse.body.data).toEqual([]);

        await AccountModel.create({
            userId,
            provider: AccountProvider.GITHUB,
            providerAccountId: "e2e-github-id",
            username: "e2e-github",
            email: "e2e-github@example.com",
            avatarUrl: "https://example.com/e2e-github.png",
            profileUrl: "https://github.com/e2e-github",
            accessToken: "e2e-private-access-token",
            refreshToken: "e2e-private-refresh-token",
            scopes: ["read:user", "user:email"],
        });

        const listResponse = await agent.get("/api/v1/identity/account");
        expect(listResponse.status).toBe(200);
        expect(listResponse.body.data).toHaveLength(1);
        expect(listResponse.body.data[0]).toEqual(
            expect.objectContaining({
                provider: AccountProvider.GITHUB,
                username: "e2e-github",
                email: "e2e-github@example.com",
            }),
        );
        expect(JSON.stringify(listResponse.body)).not.toContain(
            "e2e-private-access-token",
        );

        const getResponse = await agent.get(
            `/api/v1/identity/account/${AccountProvider.GITHUB}`,
        );
        expect(getResponse.status).toBe(200);
        expect(getResponse.body.data.provider).toBe(AccountProvider.GITHUB);

        const deleteResponse = await agent.delete(
            `/api/v1/identity/account/${AccountProvider.GITHUB}`,
        );
        expect(deleteResponse.status).toBe(200);

        const finalListResponse = await agent.get(
            "/api/v1/identity/account",
        );
        expect(finalListResponse.status).toBe(200);
        expect(finalListResponse.body.data).toEqual([]);

        const missingResponse = await agent.get(
            `/api/v1/identity/account/${AccountProvider.GITHUB}`,
        );
        expect(missingResponse.status).toBe(404);
    });
});
