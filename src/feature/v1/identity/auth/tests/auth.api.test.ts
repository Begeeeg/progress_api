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

// API tests treat the server as a black box: we only assert on what a real
// HTTP client would see (status, body shape, headers) — never on internal
// DB state. Email sending is mocked purely so tests don't hit a real SMTP
// server; we don't inspect its arguments here (that belongs to the
// integration/unit tests).
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

const getSetCookies = (res: request.Response): string[] =>
    res.headers["set-cookie"] as unknown as string[];

const validRegisterBody = (overrides: Record<string, unknown> = {}) => ({
    username: "johndoe",
    givenname: "john",
    surname: "doe",
    email: "john@gmail.com",
    password: "Password1",
    confirmPassword: "Password1",
    ...overrides,
});

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGO_URI = replSet.getUri();

    await mongoose.connect(process.env.MONGO_URI);
    app = (await import("../../../../../app")).default;
}, 60_000);

afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
});

beforeEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

describe("Auth API contract", () => {
    describe("POST /api/v1/identity/auth/register", () => {
        it("returns 201 with the expected response shape", async () => {
            const res = await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            expect(res.status).toBe(201);
            expect(res.headers["content-type"]).toMatch(/json/);
            expect(res.body).toEqual({
                message: expect.any(String),
                data: {
                    userId: expect.any(String),
                    username: "johndoe",
                    givenname: "John", // capitalized by the DTO transform
                    surname: "Doe",
                    email: "john@gmail.com",
                    isOnline: true,
                    isVerified: false,
                },
            });
        });

        it("sets an httpOnly jwt cookie", async () => {
            const res = await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            const cookies = getSetCookies(res);
            expect(cookies.some((c) => c.startsWith("jwt="))).toBe(true);
            expect(cookies.some((c) => /HttpOnly/i.test(c))).toBe(true);
        });

        it.each([
            ["missing username", { username: undefined }],
            ["username too short", { username: "ab" }],
            ["username too long", { username: "a".repeat(16) }],
            ["invalid email format", { email: "not-an-email" }],
            ["disallowed email domain", { email: "john@notallowed.com" }],
            [
                "weak password (no uppercase)",
                { password: "password1", confirmPassword: "password1" },
            ],
            [
                "weak password (too short)",
                { password: "Pass1", confirmPassword: "Pass1" },
            ],
            ["mismatched confirmPassword", { confirmPassword: "Different1" }],
        ])(
            "returns 400 with an error body for: %s",
            async (_label, overrides) => {
                const res = await request(app)
                    .post("/api/v1/identity/auth/register")
                    .send(validRegisterBody(overrides));

                expect(res.status).toBe(400);
                expect(res.body).toHaveProperty("message");
                expect(typeof res.body.message).toBe("string");
            }
        );

        it("returns 409 with an error body on duplicate email", async () => {
            await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            const res = await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody({ username: "differentuser" }));

            expect(res.status).toBe(409);
            expect(res.body).toEqual({ message: expect.any(String) });
        });

        it("returns 409 with an error body on duplicate username", async () => {
            await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            const res = await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody({ email: "different@gmail.com" }));

            expect(res.status).toBe(409);
        });
    });

    describe("GET /api/v1/identity/auth/verify-email", () => {
        it("returns 400 when no token query param is provided", async () => {
            const res = await request(app).get(
                "/api/v1/identity/auth/verify-email"
            );
            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("message");
        });

        it("returns 400 for a syntactically valid but unknown token", async () => {
            const res = await request(app).get(
                "/api/v1/identity/auth/verify-email?token=0123456789abcdef0123456789abcdef"
            );
            expect(res.status).toBe(400);
        });

        it("returns 200 with a plain message body on a valid token", async () => {
            await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            const AuthModel = (await import("../auth.model")).default;
            const auth = await AuthModel.findOne({}).select(
                "+verificationToken"
            );

            const res = await request(app).get(
                `/api/v1/identity/auth/verify-email?token=${
                    auth!.verificationToken
                }`
            );

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ message: expect.any(String) });
        });
    });

    describe("POST /api/v1/identity/auth/login", () => {
        beforeEach(async () => {
            await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());
        });

        it("returns 200 with the expected response shape on success", async () => {
            const res = await request(app)
                .post("/api/v1/identity/auth/login")
                .send({ email: "john@gmail.com", password: "Password1" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                message: expect.any(String),
                data: {
                    userId: expect.any(String),
                    username: "johndoe",
                    givenname: "John",
                    surname: "Doe",
                    email: "john@gmail.com",
                    isOnline: true,
                    isVerified: false,
                },
            });
        });

        it.each([
            [
                "wrong password",
                { email: "john@gmail.com", password: "WrongPass1" },
            ],
            [
                "unknown email",
                { email: "nouser@gmail.com", password: "Password1" },
            ],
            [
                "malformed email",
                { email: "not-an-email", password: "Password1" },
            ],
            [
                "password too short",
                { email: "john@gmail.com", password: "short" },
            ],
        ])("returns 400 for: %s", async (_label, body) => {
            const res = await request(app)
                .post("/api/v1/identity/auth/login")
                .send(body);

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("message");
        });

        it("never leaks whether the failure was a bad email or bad password", async () => {
            const wrongEmail = await request(app)
                .post("/api/v1/identity/auth/login")
                .send({ email: "nouser@gmail.com", password: "Password1" });

            const wrongPassword = await request(app)
                .post("/api/v1/identity/auth/login")
                .send({ email: "john@gmail.com", password: "WrongPass1" });

            // Both failure modes must be indistinguishable to the caller
            expect(wrongEmail.body.message).toBe(wrongPassword.body.message);
        });
    });

    describe("POST /api/v1/identity/auth/logout", () => {
        it("returns 401 with an error body when unauthenticated", async () => {
            const res = await request(app).post("/api/v1/identity/auth/logout");
            expect(res.status).toBe(401);
            expect(res.body).toEqual({ message: expect.any(String) });
        });

        it("clears the jwt cookie on success", async () => {
            await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());
            const loginRes = await request(app)
                .post("/api/v1/identity/auth/login")
                .send({ email: "john@gmail.com", password: "Password1" });

            const res = await request(app)
                .post("/api/v1/identity/auth/logout")
                .set("Cookie", getSetCookies(loginRes));

            expect(res.status).toBe(200);
            const clearedCookie = getSetCookies(res).find((c) =>
                c.startsWith("jwt=")
            );
            expect(clearedCookie).toBeDefined();
            expect(clearedCookie).toMatch(/jwt=;/);
        });
    });

    describe("POST /api/v1/identity/auth/resend-verification", () => {
        it("returns 401 with an error body when unauthenticated", async () => {
            const res = await request(app).post(
                "/api/v1/identity/auth/resend-verification"
            );
            expect(res.status).toBe(401);
            expect(res.body).toEqual({ message: expect.any(String) });
        });
    });

    describe("unknown routes", () => {
        it("returns 404 with a plain error body", async () => {
            const res = await request(app).get(
                "/api/v1/identity/auth/does-not-exist"
            );
            expect(res.status).toBe(404);
            expect(res.body).toEqual({ message: expect.any(String) });
        });
    });
});
