import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    vi,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// A real user's lifecycle naturally spans both the auth and user features:
// register → verify → manage profile → change password → delete account.
// This suite chains all of it with a single persistent agent, the way an
// actual client would, rather than testing each feature in isolation.
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
let sendVerificationEmail: ReturnType<typeof vi.fn>;

const registerBody = (overrides: Record<string, unknown> = {}) => ({
    username: "janedoe",
    givenname: "jane",
    surname: "doe",
    email: "jane@gmail.com",
    password: "Password1",
    confirmPassword: "Password1",
    ...overrides,
});

const extractTokenFromLastEmailCall = (): string => {
    const lastCall =
        sendVerificationEmail.mock.calls[
            sendVerificationEmail.mock.calls.length - 1
        ];
    return lastCall[2] as string;
};

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGO_URI = replSet.getUri();

    await mongoose.connect(process.env.MONGO_URI);
    app = (await import("../../../../../app")).default;
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
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

describe("User E2E journey", () => {
    it("walks a user through: register → verify → view profile → update info → change password → re-login with new password → search self → delete account", async () => {
        const agent = request.agent(app);

        // 1. Register (unverified accounts get 403 on /users/*, confirming
        // the journey genuinely depends on verification, not just a cookie)
        const registerRes = await agent
            .post("/api/v1/identity/auth/register")
            .send(registerBody());
        expect(registerRes.status).toBe(201);

        const preVerifyProfile = await agent.get("/api/v1/identity/user/me");
        expect(preVerifyProfile.status).toBe(403);

        // 2. Verify email
        const token = extractTokenFromLastEmailCall();
        const verifyRes = await agent.get(
            `/api/v1/identity/auth/verify-email?token=${token}`
        );
        expect(verifyRes.status).toBe(200);

        // 3. Now the profile is reachable and reflects verified state
        const profileRes = await agent.get("/api/v1/identity/user/me");
        expect(profileRes.status).toBe(200);
        expect(profileRes.body.data).toEqual(
            expect.objectContaining({
                username: "janedoe",
                givenname: "Jane",
                surname: "Doe",
                isVerified: true,
            })
        );

        // 4. Update profile info (partial update — surname only)
        const updateInfoRes = await agent
            .patch("/api/v1/identity/user/update-info")
            .send({ surname: "Smith", password: "Password1" });
        expect(updateInfoRes.status).toBe(200);
        expect(updateInfoRes.body.data.surname).toBe("Smith");
        expect(updateInfoRes.body.data.givenname).toBe("Jane"); // unchanged

        // 5. The change is durable — re-fetching the profile reflects it
        const profileAfterUpdate = await agent.get("/api/v1/identity/user/me");
        expect(profileAfterUpdate.body.data.surname).toBe("Smith");

        // 6. Change password
        const changePasswordRes = await agent
            .patch("/api/v1/identity/user/update-password")
            .send({
                currentPassword: "Password1",
                newPassword: "NewPass1",
                confirmNewPassword: "NewPass1",
            });
        expect(changePasswordRes.status).toBe(200);

        // 7. The old password must no longer work
        const oldPasswordLogin = await request(app)
            .post("/api/v1/identity/auth/login")
            .send({ email: "jane@gmail.com", password: "Password1" });
        expect(oldPasswordLogin.status).toBe(400);

        // 8. A fresh login with the new password succeeds
        const freshAgent = request.agent(app);
        const newPasswordLogin = await freshAgent
            .post("/api/v1/identity/auth/login")
            .send({ email: "jane@gmail.com", password: "NewPass1" });
        expect(newPasswordLogin.status).toBe(200);

        // 9. Another (unauthenticated) party can find this user via public
        // search, using the updated surname
        const searchRes = await request(app).get(
            "/api/v1/identity/user/search?surname=Smith"
        );
        expect(searchRes.status).toBe(200);
        expect(searchRes.body.data).toEqual([
            expect.objectContaining({ username: "janedoe", surname: "Smith" }),
        ]);

        // 10. Delete the account using the fresh (post-password-change) session
        const deleteRes = await freshAgent
            .delete("/api/v1/identity/user/me")
            .send({ password: "NewPass1" });
        expect(deleteRes.status).toBe(200);

        // 11. The account no longer exists anywhere: can't fetch profile,
        // can't log in, and no longer appears in search
        const profileAfterDelete = await freshAgent.get(
            "/api/v1/identity/user/me"
        );
        expect(profileAfterDelete.status).toBe(401);

        const loginAfterDelete = await request(app)
            .post("/api/v1/identity/auth/login")
            .send({ email: "jane@gmail.com", password: "NewPass1" });
        expect(loginAfterDelete.status).toBe(400);

        const searchAfterDelete = await request(app).get(
            "/api/v1/identity/user/search?surname=Smith"
        );
        expect(searchAfterDelete.body.data).toEqual([]);
    });

    it("blocks profile management for an unverified account throughout the journey", async () => {
        const agent = request.agent(app);

        await agent.post("/api/v1/identity/auth/register").send(registerBody());

        // None of the profile-management routes should work pre-verification
        const getProfile = await agent.get("/api/v1/identity/user/me");
        expect(getProfile.status).toBe(403);

        const updateInfo = await agent
            .patch("/api/v1/identity/user/update-info")
            .send({ surname: "Smith", password: "Password1" });
        expect(updateInfo.status).toBe(403);

        const updatePassword = await agent
            .patch("/api/v1/identity/user/update-password")
            .send({
                currentPassword: "Password1",
                newPassword: "NewPass1",
                confirmNewPassword: "NewPass1",
            });
        expect(updatePassword.status).toBe(403);

        // Public search still works regardless of the searched-for user's
        // own verification status
        const searchRes = await request(app).get(
            "/api/v1/identity/user/search?username=janedoe"
        );
        expect(searchRes.status).toBe(200);
        expect(searchRes.body.data).toHaveLength(1);
    });

    it("prevents changing to a username taken by a second, separately-registered user", async () => {
        const firstAgent = request.agent(app);
        await firstAgent
            .post("/api/v1/identity/auth/register")
            .send(
                registerBody({ username: "taken", email: "taken@gmail.com" })
            );
        const firstToken = extractTokenFromLastEmailCall();
        await firstAgent.get(
            `/api/v1/identity/auth/verify-email?token=${firstToken}`
        );

        const secondAgent = request.agent(app);
        await secondAgent
            .post("/api/v1/identity/auth/register")
            .send(
                registerBody({ username: "janedoe", email: "jane2@gmail.com" })
            );
        const secondToken = extractTokenFromLastEmailCall();
        await secondAgent.get(
            `/api/v1/identity/auth/verify-email?token=${secondToken}`
        );

        const res = await secondAgent
            .patch("/api/v1/identity/user/update-info")
            .send({ username: "taken", password: "Password1" });

        expect(res.status).toBe(409);

        // The second user's own username must remain unchanged
        const profile = await secondAgent.get("/api/v1/identity/user/me");
        expect(profile.body.data.username).toBe("janedoe");
    });
});
