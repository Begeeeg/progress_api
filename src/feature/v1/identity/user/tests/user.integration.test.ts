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
let UserModel: typeof import("../user.model").default;
let AuthModel: typeof import("../../auth/auth.model").default;
let sendVerificationEmail: ReturnType<typeof vi.fn>;

const getSetCookies = (res: request.Response): string[] =>
    res.headers["set-cookie"] as unknown as string[];

const registerBody = (overrides: Record<string, unknown> = {}) => ({
    username: "johndoe",
    givenname: "john",
    surname: "doe",
    email: "john@gmail.com",
    password: "Password1",
    confirmPassword: "Password1",
    ...overrides,
});

/** Registers a user and returns an agent + userId WITHOUT completing email
 * verification — for tests that specifically need an unverified account. */
const registerOnly = async (overrides: Record<string, unknown> = {}) => {
    const agent = request.agent(app);
    const res = await agent
        .post("/api/v1/identity/auth/register")
        .send(registerBody(overrides));
    return { agent, userId: res.body.data.userId as string };
};

/** Registers a new user, "clicks" the verification link using the token
 * captured from the mocked email, and returns an agent already carrying a
 * verified session — required for every /users/* route since protectRoutes
 * rejects unverified accounts with 403. */
const registerAndAuthenticate = async (
    overrides: Record<string, unknown> = {}
) => {
    const { agent, userId } = await registerOnly(overrides);

    const lastCall =
        sendVerificationEmail.mock.calls[
            sendVerificationEmail.mock.calls.length - 1
        ];
    const token = lastCall[2] as string;

    const verifyRes = await agent.get(
        `/api/v1/identity/auth/verify-email?token=${token}`
    );
    if (verifyRes.status !== 200) {
        throw new Error(
            `Test setup failed: email verification did not succeed (status ${verifyRes.status})`
        );
    }

    return { agent, userId };
};

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGO_URI = replSet.getUri();

    await mongoose.connect(process.env.MONGO_URI);
    app = (await import("../../../../../app")).default;
    UserModel = (await import("../user.model")).default;
    AuthModel = (await import("../../auth/auth.model")).default;
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

describe("User integration", () => {
    describe("GET /api/v1/identity/user/me", () => {
        it("requires authentication", async () => {
            const res = await request(app).get("/api/v1/identity/user/me");
            expect(res.status).toBe(401);
        });

        it("returns 403 with a clear message when the account is not yet verified (regression: was silently swallowed into a generic 401)", async () => {
            const { agent } = await registerOnly();

            const res = await agent.get("/api/v1/identity/user/me");

            expect(res.status).toBe(403);
            expect(res.body).toEqual({ message: "User is not verified" });
        });

        it("returns the authenticated user's profile", async () => {
            const { agent } = await registerAndAuthenticate();

            const res = await agent.get("/api/v1/identity/user/me");

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual(
                expect.objectContaining({
                    username: "johndoe",
                    givenname: "John",
                    surname: "Doe",
                    email: "john@gmail.com",
                    isVerified: true,
                })
            );
        });
    });

    describe("PATCH /api/v1/identity/user/update-info", () => {
        it("requires authentication", async () => {
            const res = await request(app)
                .patch("/api/v1/identity/user/update-info")
                .send({ givenname: "Jane", password: "Password1" });
            expect(res.status).toBe(401);
        });

        it("updates only the provided field and preserves the rest", async () => {
            const { agent } = await registerAndAuthenticate();

            const res = await agent
                .patch("/api/v1/identity/user/update-info")
                .send({ givenname: "Jane", password: "Password1" });

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual(
                expect.objectContaining({
                    username: "johndoe", // unchanged
                    givenname: "Jane", // updated
                    surname: "Doe", // unchanged
                })
            );
        });

        it("rejects an incorrect confirmation password", async () => {
            const { agent } = await registerAndAuthenticate();

            const res = await agent
                .patch("/api/v1/identity/user/update-info")
                .send({ givenname: "Jane", password: "WrongPass1" });

            expect(res.status).toBe(400);
        });

        it("rejects a no-op update (nothing actually changed)", async () => {
            const { agent } = await registerAndAuthenticate();

            const res = await agent
                .patch("/api/v1/identity/user/update-info")
                .send({ username: "johndoe", password: "Password1" });

            expect(res.status).toBe(400);
        });

        it("rejects a username that is already taken by another account", async () => {
            await registerAndAuthenticate({
                username: "existinguser",
                email: "existing@gmail.com",
            });
            const { agent } = await registerAndAuthenticate();

            const res = await agent
                .patch("/api/v1/identity/user/update-info")
                .send({ username: "existinguser", password: "Password1" });

            expect(res.status).toBe(409);
        });
    });

    describe("PATCH /api/v1/identity/user/update-password", () => {
        it("requires authentication", async () => {
            const res = await request(app)
                .patch("/api/v1/identity/user/update-password")
                .send({
                    currentPassword: "Password1",
                    newPassword: "NewPass1",
                    confirmNewPassword: "NewPass1",
                });
            expect(res.status).toBe(401);
        });

        it("updates the password and allows login with the new one", async () => {
            const { agent } = await registerAndAuthenticate();

            const updateRes = await agent
                .patch("/api/v1/identity/user/update-password")
                .send({
                    currentPassword: "Password1",
                    newPassword: "NewPass1",
                    confirmNewPassword: "NewPass1",
                });
            expect(updateRes.status).toBe(200);

            const loginRes = await request(app)
                .post("/api/v1/identity/auth/login")
                .send({ email: "john@gmail.com", password: "NewPass1" });
            expect(loginRes.status).toBe(200);
        });

        it("rejects when confirmNewPassword does not match", async () => {
            const { agent } = await registerAndAuthenticate();

            const res = await agent
                .patch("/api/v1/identity/user/update-password")
                .send({
                    currentPassword: "Password1",
                    newPassword: "NewPass1",
                    confirmNewPassword: "Different1",
                });
            expect(res.status).toBe(400);
        });

        it("rejects when the current password is wrong", async () => {
            const { agent } = await registerAndAuthenticate();

            const res = await agent
                .patch("/api/v1/identity/user/update-password")
                .send({
                    currentPassword: "WrongOld1",
                    newPassword: "NewPass1",
                    confirmNewPassword: "NewPass1",
                });
            expect(res.status).toBe(400);
        });
    });

    describe("GET /api/v1/identity/user/search", () => {
        beforeEach(async () => {
            await registerOnly({
                username: "alicesmith",
                givenname: "alice",
                surname: "smith",
                email: "alice@gmail.com",
            });
            await registerOnly({
                username: "bobjones",
                givenname: "bob",
                surname: "jones",
                email: "bob@gmail.com",
            });
        });

        it("does not require authentication", async () => {
            const res = await request(app).get(
                "/api/v1/identity/user/search?username=alice"
            );
            expect(res.status).toBe(200);
        });

        it("finds a match by username", async () => {
            const res = await request(app).get(
                "/api/v1/identity/user/search?username=alicesmith"
            );
            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].username).toBe("alicesmith");
        });

        it("finds a match by givenname", async () => {
            const res = await request(app).get(
                "/api/v1/identity/user/search?givenname=Bob"
            );
            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].username).toBe("bobjones");
        });

        it("finds a match by surname", async () => {
            const res = await request(app).get(
                "/api/v1/identity/user/search?surname=Smith"
            );
            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].username).toBe("alicesmith");
        });

        it("returns 400 when no query param is provided at all", async () => {
            const res = await request(app).get("/api/v1/identity/user/search");
            expect(res.status).toBe(400);
        });

        it("returns an empty array (not an error) when nothing matches", async () => {
            const res = await request(app).get(
                "/api/v1/identity/user/search?username=doesnotexist"
            );
            expect(res.status).toBe(200);
            expect(res.body.data).toEqual([]);
        });
    });

    describe("DELETE /api/v1/identity/user/me", () => {
        it("requires authentication", async () => {
            const res = await request(app)
                .delete("/api/v1/identity/user/me")
                .send({ password: "Password1" });
            expect(res.status).toBe(401);
        });

        it("deletes the account and its auth record, and clears the session", async () => {
            const { agent, userId } = await registerAndAuthenticate();

            const res = await agent
                .delete("/api/v1/identity/user/me")
                .send({ password: "Password1" });

            expect(res.status).toBe(200);
            expect(getSetCookies(res).some((c) => c.startsWith("jwt=;"))).toBe(
                true
            );

            const userAfter = await UserModel.findById(userId);
            const authAfter = await AuthModel.findOne({ userId });
            expect(userAfter).toBeNull();
            expect(authAfter).toBeNull();
        });

        it("rejects deletion with the wrong password and keeps the account intact", async () => {
            const { agent, userId } = await registerAndAuthenticate();

            const res = await agent
                .delete("/api/v1/identity/user/me")
                .send({ password: "WrongPass1" });

            expect(res.status).toBe(400);

            const userAfter = await UserModel.findById(userId);
            expect(userAfter).not.toBeNull();
        });

        it("prevents access to protected routes with the old session after deletion", async () => {
            const { agent } = await registerAndAuthenticate();

            await agent
                .delete("/api/v1/identity/user/me")
                .send({ password: "Password1" });

            const res = await agent.get("/api/v1/identity/user/me");
            expect(res.status).toBe(401);
        });
    });
});
