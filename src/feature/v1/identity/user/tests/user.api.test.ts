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

// API tests treat the server as a black box: assertions are limited to what
// a real HTTP client would see (status, body shape, headers). Preconditions
// (a verified, authenticated session) are set up via the real auth API
// rather than direct DB writes, so these tests don't silently depend on
// internal model shapes.
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

const registerAndAuthenticate = async (
    overrides: Record<string, unknown> = {}
) => {
    const agent = request.agent(app);
    await agent
        .post("/api/v1/identity/auth/register")
        .send(registerBody(overrides));

    const lastCall =
        sendVerificationEmail.mock.calls[
            sendVerificationEmail.mock.calls.length - 1
        ];
    const token = lastCall[2] as string;

    await agent.get(`/api/v1/identity/auth/verify-email?token=${token}`);

    return agent;
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

describe("User API contract", () => {
    describe("GET /api/v1/identity/user/me", () => {
        it("returns 401 with an error body when unauthenticated", async () => {
            const res = await request(app).get("/api/v1/identity/user/me");
            expect(res.status).toBe(401);
            expect(res.body).toEqual({ message: expect.any(String) });
        });

        it("returns 200 with the expected profile shape", async () => {
            const agent = await registerAndAuthenticate();

            const res = await agent.get("/api/v1/identity/user/me");

            expect(res.status).toBe(200);
            expect(res.headers["content-type"]).toMatch(/json/);
            expect(res.body).toEqual({
                message: expect.any(String),
                data: {
                    id: expect.any(String),
                    username: "johndoe",
                    givenname: "John",
                    surname: "Doe",
                    email: "john@gmail.com",
                    isOnline: expect.any(Boolean),
                    isVerified: true,
                },
            });
        });
    });

    describe("PATCH /api/v1/identity/user/update-info", () => {
        it.each([
            ["username too short", { username: "ab", password: "Password1" }],
            [
                "givenname too long",
                { givenname: "a".repeat(16), password: "Password1" },
            ],
            ["missing password", { givenname: "Jane" }],
        ])("returns 400 with an error body for: %s", async (_label, body) => {
            const agent = await registerAndAuthenticate();

            const res = await agent
                .patch("/api/v1/identity/user/update-info")
                .send(body);

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("message");
        });

        it("returns 200 with the updated profile shape", async () => {
            const agent = await registerAndAuthenticate();

            const res = await agent
                .patch("/api/v1/identity/user/update-info")
                .send({ surname: "Smith", password: "Password1" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                message: expect.any(String),
                data: {
                    id: expect.any(String),
                    username: "johndoe",
                    givenname: "John",
                    surname: "Smith",
                },
            });
        });

        it("returns 409 with an error body when the username is taken", async () => {
            await registerAndAuthenticate({
                username: "existinguser",
                email: "existing@gmail.com",
            });
            const agent = await registerAndAuthenticate();

            const res = await agent
                .patch("/api/v1/identity/user/update-info")
                .send({ username: "existinguser", password: "Password1" });

            expect(res.status).toBe(409);
            expect(res.body).toEqual({ message: expect.any(String) });
        });
    });

    describe("PATCH /api/v1/identity/user/update-password", () => {
        it.each([
            [
                "weak new password",
                {
                    currentPassword: "Password1",
                    newPassword: "weak",
                    confirmNewPassword: "weak",
                },
            ],
            [
                "mismatched confirmation",
                {
                    currentPassword: "Password1",
                    newPassword: "NewPass1",
                    confirmNewPassword: "Different1",
                },
            ],
            [
                "missing currentPassword",
                {
                    newPassword: "NewPass1",
                    confirmNewPassword: "NewPass1",
                },
            ],
        ])("returns 400 with an error body for: %s", async (_label, body) => {
            const agent = await registerAndAuthenticate();

            const res = await agent
                .patch("/api/v1/identity/user/update-password")
                .send(body);

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("message");
        });

        it("returns 200 with a plain message body on success", async () => {
            const agent = await registerAndAuthenticate();

            const res = await agent
                .patch("/api/v1/identity/user/update-password")
                .send({
                    currentPassword: "Password1",
                    newPassword: "NewPass1",
                    confirmNewPassword: "NewPass1",
                });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ message: expect.any(String) });
        });
    });

    describe("GET /api/v1/identity/user/search", () => {
        it("returns 400 with an error body when no search field is given", async () => {
            const res = await request(app).get("/api/v1/identity/user/search");
            expect(res.status).toBe(400);
            expect(res.body).toEqual({ message: expect.any(String) });
        });

        it("returns 200 with an array shape, without requiring authentication", async () => {
            await registerAndAuthenticate({
                username: "findable",
                email: "findable@gmail.com",
            });

            const res = await request(app).get(
                "/api/v1/identity/user/search?username=findable"
            );

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                message: expect.any(String),
                data: [
                    {
                        id: expect.any(String),
                        username: "findable",
                        givenname: expect.any(String),
                        surname: expect.any(String),
                        email: "findable@gmail.com",
                        isOnline: expect.any(Boolean),
                    },
                ],
            });
        });
    });

    describe("DELETE /api/v1/identity/user/me", () => {
        it("returns 401 with an error body when unauthenticated", async () => {
            const res = await request(app)
                .delete("/api/v1/identity/user/me")
                .send({ password: "Password1" });
            expect(res.status).toBe(401);
            expect(res.body).toEqual({ message: expect.any(String) });
        });

        it("returns 400 with an error body when the confirmation password is empty", async () => {
            const agent = await registerAndAuthenticate();

            const res = await agent
                .delete("/api/v1/identity/user/me")
                .send({ password: "" });

            expect(res.status).toBe(400);
        });

        it("returns 200 and clears the jwt cookie on success", async () => {
            const agent = await registerAndAuthenticate();

            const res = await agent
                .delete("/api/v1/identity/user/me")
                .send({ password: "Password1" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ message: expect.any(String) });
            const clearedCookie = getSetCookies(res).find((c) =>
                c.startsWith("jwt=")
            );
            expect(clearedCookie).toMatch(/jwt=;/);
        });
    });
});
