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

// E2E tests simulate a real client (browser/mobile app) walking through a
// full auth lifecycle. We mock only the outbound email transport (no real
// SMTP in CI), but capture the verification token exactly as a real user
// would receive it in their inbox, then "click the link" by using that
// token in a follow-up request — nothing about the app's internals is
// bypassed or peeked at directly.
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
let sendWelcomeEmail: ReturnType<typeof vi.fn>;

const registerBody = {
    username: "janedoe",
    givenname: "jane",
    surname: "doe",
    email: "jane@gmail.com",
    password: "Password1",
    confirmPassword: "Password1",
};

/** Pulls the verification token out of the mocked email call, the way a
 * real user would get it by clicking the link in their inbox. */
const extractTokenFromLastEmailCall = (): string => {
    const lastCall =
        sendVerificationEmail.mock.calls[
            sendVerificationEmail.mock.calls.length - 1
        ];
    // sendVerificationEmail(email, username, token)
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
    sendWelcomeEmail = (
        await import("../../../../../common/utils/sendWelcomeEmail")
    ).sendWelcomeEmail as unknown as ReturnType<typeof vi.fn>;
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

describe("Auth E2E journey", () => {
    it("walks a new user through the full lifecycle: register → verify → login → use session → logout → session revoked", async () => {
        // `request.agent` behaves like a real browser: it stores and
        // replays cookies automatically across requests, so we never
        // manually thread `Cookie` headers between steps here.
        const agent = request.agent(app);

        // 1. Register
        const registerRes = await agent
            .post("/api/v1/identity/auth/register")
            .send(registerBody);
        expect(registerRes.status).toBe(201);
        expect(registerRes.body.data.isVerified).toBe(false);
        expect(sendVerificationEmail).toHaveBeenCalledTimes(1);

        // 2. Registering also logs the user in (a jwt cookie is set), so a
        // protected route should already work before email verification.
        const preVerifyResend = await agent.post(
            "/api/v1/identity/auth/resend-verification"
        );
        expect(preVerifyResend.status).toBe(200);
        expect(sendVerificationEmail).toHaveBeenCalledTimes(2);

        // 3. "Click the link" from the most recently sent email
        const token = extractTokenFromLastEmailCall();
        const verifyRes = await agent.get(
            `/api/v1/identity/auth/verify-email?token=${token}`
        );
        expect(verifyRes.status).toBe(200);
        expect(sendWelcomeEmail).toHaveBeenCalledTimes(1);

        // 4. Now that the user is verified, resending should be rejected —
        // proving the verification step actually changed server-side state
        // rather than just returning 200 in isolation.
        const postVerifyResend = await agent.post(
            "/api/v1/identity/auth/resend-verification"
        );
        expect(postVerifyResend.status).toBe(400);

        // 5. Log out, ending the session
        const logoutRes = await agent.post("/api/v1/identity/auth/logout");
        expect(logoutRes.status).toBe(200);

        // 6. The old session cookie must no longer grant access
        const afterLogoutResend = await agent.post(
            "/api/v1/identity/auth/resend-verification"
        );
        expect(afterLogoutResend.status).toBe(401);

        // 7. A fresh login (new agent, simulating the user coming back
        // later) should succeed and reflect the verified state
        const freshAgent = request.agent(app);
        const loginRes = await freshAgent
            .post("/api/v1/identity/auth/login")
            .send({ email: "jane@gmail.com", password: "Password1" });
        expect(loginRes.status).toBe(200);
        expect(loginRes.body.data.isVerified).toBe(true);
    });

    it("blocks the whole journey early if registration used a disallowed email domain", async () => {
        const agent = request.agent(app);

        const registerRes = await agent
            .post("/api/v1/identity/auth/register")
            .send({ ...registerBody, email: "jane@notallowed.com" });
        expect(registerRes.status).toBe(400);

        // No session should exist, so nothing downstream should work either
        const loginRes = await agent
            .post("/api/v1/identity/auth/login")
            .send({ email: "jane@notallowed.com", password: "Password1" });
        expect(loginRes.status).toBe(400);

        const resendRes = await agent.post(
            "/api/v1/identity/auth/resend-verification"
        );
        expect(resendRes.status).toBe(401);

        expect(sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("lets a user recover from a lost/expired verification token via resend, then verify with the new one", async () => {
        const agent = request.agent(app);

        await agent.post("/api/v1/identity/auth/register").send(registerBody);
        const staleToken = extractTokenFromLastEmailCall();

        // User waits too long / loses the email, and requests a new one
        const resendRes = await agent.post(
            "/api/v1/identity/auth/resend-verification"
        );
        expect(resendRes.status).toBe(200);
        const freshToken = extractTokenFromLastEmailCall();
        expect(freshToken).not.toBe(staleToken);

        // The stale token must no longer work
        const staleAttempt = await agent.get(
            `/api/v1/identity/auth/verify-email?token=${staleToken}`
        );
        expect(staleAttempt.status).toBe(400);

        // Only the fresh token succeeds
        const freshAttempt = await agent.get(
            `/api/v1/identity/auth/verify-email?token=${freshToken}`
        );
        expect(freshAttempt.status).toBe(200);
    });

    it("prevents two users from registering the same email even across separate sessions", async () => {
        const firstAgent = request.agent(app);
        const secondAgent = request.agent(app);

        const first = await firstAgent
            .post("/api/v1/identity/auth/register")
            .send(registerBody);
        expect(first.status).toBe(201);

        const second = await secondAgent
            .post("/api/v1/identity/auth/register")
            .send({ ...registerBody, username: "someoneelse" });
        expect(second.status).toBe(409);

        // The second (failed) agent should have no valid session
        const secondResend = await secondAgent.post(
            "/api/v1/identity/auth/resend-verification"
        );
        expect(secondResend.status).toBe(401);
    });
});
