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
import { cleanupUnverifiedUsers } from "../../../../../common/utils/cleanupUnverifiedUsers";

// Auth transactions require a replica set, so we mock outbound email
// sending only — everything else runs against a real in-memory Mongo.
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
let AuthModel: typeof import("../auth.model").default;
let UserModel: typeof import("../../user/user.model").default;
let sendVerificationEmail: any;

// supertest/superagent types `res.headers["set-cookie"]` as `string`, but at
// runtime Express sends it as `string[]` whenever more than one cookie header
// is present. This helper gives us the correct runtime type without `any`
// scattered through every assertion.
const getSetCookies = (res: request.Response): string[] =>
    res.headers["set-cookie"] as unknown as string[];

const validRegisterBody = () => ({
    username: "johndoe",
    givenname: "john",
    surname: "doe",
    email: "john@gmail.com",
    password: "Password1",
    confirmPassword: "Password1",
});

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    process.env.MONGO_URI = uri;

    await mongoose.connect(uri);

    app = (await import("../../../../../app")).default;
    AuthModel = (await import("../auth.model")).default;
    UserModel = (await import("../../user/user.model")).default;
    sendVerificationEmail = (
        await import("../../../../../common/utils/sendVerificationEmail")
    ).sendVerificationEmail;
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

describe("Auth integration", () => {
    describe("POST /api/v1/identity/auth/register", () => {
        it("registers a new user and sets a jwt cookie", async () => {
            const res = await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            expect(res.status).toBe(201);
            expect(res.body.message).toBe("User created successfully");
            expect(res.body.data.email).toBe("john@gmail.com");
            expect(res.body.data.isVerified).toBe(false);
            expect(res.headers["set-cookie"]).toBeDefined();
            expect(
                getSetCookies(res).some((c: string) => c.startsWith("jwt="))
            ).toBe(true);

            const userInDb = await UserModel.findOne({
                email: "john@gmail.com",
            });
            expect(userInDb).not.toBeNull();

            const authInDb = await AuthModel.findOne({
                userId: userInDb!._id,
            });
            expect(authInDb).not.toBeNull();
            expect(authInDb!.isVerified).toBe(false);

            expect(sendVerificationEmail).toHaveBeenCalledWith(
                "john@gmail.com",
                "johndoe",
                expect.any(String)
            );
        });

        it("rejects registration with an invalid email domain", async () => {
            const res = await request(app)
                .post("/api/v1/identity/auth/register")
                .send({ ...validRegisterBody(), email: "john@example.com" });

            expect(res.status).toBe(400);
        });

        it("rejects registration when passwords do not match", async () => {
            const res = await request(app)
                .post("/api/v1/identity/auth/register")
                .send({
                    ...validRegisterBody(),
                    confirmPassword: "Different1",
                });

            expect(res.status).toBe(400);
        });

        it("rejects duplicate username or email with 409", async () => {
            await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            const res = await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            expect(res.status).toBe(409);
        });
    });

    describe("GET /api/v1/identity/auth/verify-email", () => {
        it("verifies the user's email with a valid token", async () => {
            await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            const auth = await AuthModel.findOne({}).select(
                "+verificationToken"
            );
            const token = auth!.verificationToken as string;

            const res = await request(app).get(
                `/api/v1/identity/auth/verify-email?token=${token}`
            );

            expect(res.status).toBe(200);

            const updatedAuth = await AuthModel.findById(auth!._id);
            expect(updatedAuth!.isVerified).toBe(true);
        });

        it("returns 400 for a missing token", async () => {
            const res = await request(app).get(
                "/api/v1/identity/auth/verify-email"
            );
            expect(res.status).toBe(400);
        });

        it("returns 400 for an invalid token", async () => {
            const res = await request(app).get(
                "/api/v1/identity/auth/verify-email?token=bogus"
            );
            expect(res.status).toBe(400);
        });
    });

    describe("POST /api/v1/identity/auth/login", () => {
        it("logs in successfully with correct credentials", async () => {
            await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            const res = await request(app)
                .post("/api/v1/identity/auth/login")
                .send({ email: "john@gmail.com", password: "Password1" });

            expect(res.status).toBe(200);
            expect(res.body.data.email).toBe("john@gmail.com");
            expect(res.headers["set-cookie"]).toBeDefined();
        });

        it("rejects login with wrong password", async () => {
            await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            const res = await request(app)
                .post("/api/v1/identity/auth/login")
                .send({ email: "john@gmail.com", password: "WrongPass1" });

            expect(res.status).toBe(400);
        });

        it("rejects login for a nonexistent user", async () => {
            const res = await request(app)
                .post("/api/v1/identity/auth/login")
                .send({ email: "nouser@gmail.com", password: "Password1" });

            expect(res.status).toBe(400);
        });

        it("rejects login with a malformed body", async () => {
            const res = await request(app)
                .post("/api/v1/identity/auth/login")
                .send({ email: "not-an-email", password: "short" });

            expect(res.status).toBe(400);
        });
    });

    describe("POST /api/v1/identity/auth/logout", () => {
        it("requires authentication", async () => {
            const res = await request(app).post("/api/v1/identity/auth/logout");
            expect(res.status).toBe(401);
        });

        it("logs out an authenticated user and clears the cookie", async () => {
            await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            const loginRes = await request(app)
                .post("/api/v1/identity/auth/login")
                .send({ email: "john@gmail.com", password: "Password1" });

            const cookies = getSetCookies(loginRes);

            const res = await request(app)
                .post("/api/v1/identity/auth/logout")
                .set("Cookie", cookies);

            expect(res.status).toBe(200);
            expect(
                getSetCookies(res).some((c: string) => c.startsWith("jwt=;"))
            ).toBe(true);

            const user = await UserModel.findOne({ email: "john@gmail.com" });
            const auth = await AuthModel.findOne({ userId: user!._id });
            expect(auth!.isOnline).toBe(false);
        });
    });

    describe("POST /api/v1/identity/auth/resend-verification", () => {
        it("requires authentication", async () => {
            const res = await request(app).post(
                "/api/v1/identity/auth/resend-verification"
            );
            expect(res.status).toBe(401);
        });

        it("resends a verification email for an unverified authenticated user", async () => {
            await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            const loginRes = await request(app)
                .post("/api/v1/identity/auth/login")
                .send({ email: "john@gmail.com", password: "Password1" });
            const cookies = getSetCookies(loginRes);

            const res = await request(app)
                .post("/api/v1/identity/auth/resend-verification")
                .set("Cookie", cookies);

            expect(res.status).toBe(200);
            expect(sendVerificationEmail).toHaveBeenCalledTimes(2); // register + resend
        });
    });

    describe("cleanupUnverifiedUsers (weekly cron job)", () => {
        it("removes a user whose verification window has expired", async () => {
            await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            const user = await UserModel.findOne({ email: "john@gmail.com" });
            const auth = await AuthModel.findOne({ userId: user!._id });

            // Force the record into an "expired, still unverified" state,
            // exactly the case the old (buggy) implementation never caught
            // because it queried UserModel for fields that live on Auth.
            auth!.unverifiedExpiresAt = new Date(Date.now() - 1000);
            await auth!.save();

            await cleanupUnverifiedUsers();

            const userAfter = await UserModel.findById(user!._id);
            const authAfter = await AuthModel.findById(auth!._id);

            expect(userAfter).toBeNull();
            expect(authAfter).toBeNull();
        });

        it("does not remove a verified user even past the original expiry window", async () => {
            await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            const user = await UserModel.findOne({ email: "john@gmail.com" });
            const auth = await AuthModel.findOne({ userId: user!._id });

            auth!.isVerified = true;
            auth!.unverifiedExpiresAt = new Date(Date.now() - 1000);
            await auth!.save();

            await cleanupUnverifiedUsers();

            const userAfter = await UserModel.findById(user!._id);
            expect(userAfter).not.toBeNull();
        });

        it("does not remove an unverified user whose window has not yet expired", async () => {
            await request(app)
                .post("/api/v1/identity/auth/register")
                .send(validRegisterBody());

            const user = await UserModel.findOne({ email: "john@gmail.com" });

            await cleanupUnverifiedUsers();

            const userAfter = await UserModel.findById(user!._id);
            expect(userAfter).not.toBeNull();
        });
    });
});
