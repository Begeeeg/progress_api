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

// Contract-level tests: assertions are limited to what an HTTP client sees
// (status, body shape, content-type). Preconditions go through the real
// auth API so `protectRoutes` is satisfied exactly as in production.
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

const BASE = "/api/v1/progress/project";

const futureISO = (daysAhead = 7) =>
    new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

const createVerifiedUser = async (
    username = "owneruser",
    email = "owner@gmail.com"
) => {
    const agent = request.agent(app);

    await agent.post("/api/v1/identity/auth/register").send({
        username,
        givenname: "given",
        surname: "surname",
        email,
        password: "Password1",
        confirmPassword: "Password1",
    });

    const calls = sendVerificationEmail.mock.calls;
    const token = calls[calls.length - 1][2] as string;
    await agent.get(`/api/v1/identity/auth/verify-email?token=${token}`);

    return agent;
};

const seedProject = async (
    agent: ReturnType<typeof request.agent>,
    overrides: Record<string, unknown> = {}
) => {
    await agent
        .post(BASE)
        .send({ title: "Seed", dueDate: futureISO(), ...overrides });
    const list = await agent.get(BASE);
    return list.body.data[0].id as string;
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

describe("Project API contract", () => {
    describe("authentication contract", () => {
        it.each([
            ["POST", BASE],
            ["GET", BASE],
            ["GET", `${BASE}/search`],
            ["GET", `${BASE}/getbyid`],
            ["PATCH", `${BASE}/update`],
            ["DELETE", `${BASE}/delete`],
            ["GET", `${BASE}/shared`],
            ["DELETE", `${BASE}/leave`],
        ])(
            "%s %s returns 401 with an error body when unauthenticated",
            async (method, path) => {
                const res = await (request(app) as any)
                    [method.toLowerCase()](path)
                    .send({});

                expect(res.status).toBe(401);
                expect(res.body).toEqual({ message: expect.any(String) });
            }
        );
    });

    describe("POST /api/v1/progress/project", () => {
        it("returns 201 with the documented response shape", async () => {
            const agent = await createVerifiedUser();

            const res = await agent.post(BASE).send({
                title: "Shaped",
                documentation: "docs",
                githubRepo: "repo",
                dueDate: futureISO(),
            });

            expect(res.status).toBe(201);
            expect(res.headers["content-type"]).toMatch(/json/);
            expect(res.body).toEqual({
                message: expect.any(String),
                data: {
                    title: "Shaped",
                    type: expect.any(String),
                    document: "docs",
                    githubRepo: "repo",
                    status: expect.any(String),
                    dueDate: expect.any(String),
                    members: expect.any(Array),
                    remainingDays: expect.any(Number),
                    isOwner: true,
                },
            });
        });

        it.each([
            ["missing title", { dueDate: futureISO() }],
            ["empty title", { title: "", dueDate: futureISO() }],
            ["title too long", { title: "a".repeat(16), dueDate: futureISO() }],
            ["missing dueDate", { title: "NoDate" }],
            ["unparseable dueDate", { title: "Bad", dueDate: "not-a-date" }],
            [
                "invalid type enum",
                { title: "Bad", dueDate: futureISO(), type: "bogus" },
            ],
            [
                "invalid status enum",
                { title: "Bad", dueDate: futureISO(), status: "bogus" },
            ],
            [
                "members not an array of strings",
                { title: "Bad", dueDate: futureISO(), members: [123] },
            ],
        ])("returns 400 with an error body for: %s", async (_label, body) => {
            const agent = await createVerifiedUser();

            const res = await agent.post(BASE).send(body);

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("message");
        });

        it("returns 404 with an error body when a named member does not exist", async () => {
            const agent = await createVerifiedUser();

            const res = await agent.post(BASE).send({
                title: "Ghosts",
                dueDate: futureISO(),
                type: "team",
                members: ["nosuchuser"],
            });

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ message: expect.any(String) });
        });
    });

    describe("GET /api/v1/progress/project", () => {
        it("returns 200 with an array payload", async () => {
            const agent = await createVerifiedUser();
            await seedProject(agent);

            const res = await agent.get(BASE);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                message: expect.any(String),
                data: expect.any(Array),
            });
            expect(res.body.data[0]).toEqual(
                expect.objectContaining({
                    id: expect.any(String),
                    userId: expect.any(String),
                    title: expect.any(String),
                    remainingDays: expect.any(Number),
                    isOwner: expect.any(Boolean),
                })
            );
        });
    });

    describe("GET /api/v1/progress/project/getbyid", () => {
        it("returns 400 with an error body when projectId is absent", async () => {
            const agent = await createVerifiedUser();

            const res = await agent.get(`${BASE}/getbyid`);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ message: expect.any(String) });
        });

        it("returns 400 when projectId is repeated (parsed as an array)", async () => {
            const agent = await createVerifiedUser();

            const res = await agent.get(
                `${BASE}/getbyid?projectId=a&projectId=b`
            );

            expect(res.status).toBe(400);
        });

        it("returns 200 with the documented single-project shape", async () => {
            const agent = await createVerifiedUser();
            const projectId = await seedProject(agent);

            const res = await agent.get(
                `${BASE}/getbyid?projectId=${projectId}`
            );

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual(
                expect.objectContaining({
                    id: projectId,
                    title: expect.any(String),
                    remainingDays: expect.any(Number),
                    isOwner: true,
                })
            );
        });
    });

    describe("GET /api/v1/progress/project/search", () => {
        it.each([
            ["invalid type", "type=bogus"],
            ["invalid status", "status=bogus"],
            ["invalid dueDate", "dueDate=not-a-date"],
            [
                "repeated dueDate (array)",
                "dueDate=2026-06-01&dueDate=2026-06-02",
            ],
        ])(
            "returns 400 with an error body for: %s",
            async (_label, queryString) => {
                const agent = await createVerifiedUser();

                const res = await agent.get(`${BASE}/search?${queryString}`);

                expect(res.status).toBe(400);
                expect(res.body).toHaveProperty("message");
            }
        );

        it("returns 200 with an array payload for a valid filter", async () => {
            const agent = await createVerifiedUser();
            await seedProject(agent);

            const res = await agent.get(`${BASE}/search?status=active`);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                message: expect.any(String),
                data: expect.any(Array),
            });
        });
    });

    describe("PATCH /api/v1/progress/project/update", () => {
        it("returns 400 with an error body when projectId is absent", async () => {
            const agent = await createVerifiedUser();

            const res = await agent.patch(`${BASE}/update`).send({
                title: "X",
            });

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ message: expect.any(String) });
        });

        it.each([
            ["title too long", { title: "a".repeat(16) }],
            ["invalid type enum", { type: "bogus" }],
            ["invalid status enum", { status: "bogus" }],
            ["unparseable dueDate", { dueDate: "not-a-date" }],
        ])("returns 400 with an error body for: %s", async (_label, body) => {
            const agent = await createVerifiedUser();
            const projectId = await seedProject(agent);

            const res = await agent
                .patch(`${BASE}/update?projectId=${projectId}`)
                .send(body);

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("message");
        });

        it("returns 200 with the documented updated shape", async () => {
            const agent = await createVerifiedUser();
            const projectId = await seedProject(agent);

            const res = await agent
                .patch(`${BASE}/update?projectId=${projectId}`)
                .send({ title: "Renamed" });

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual(
                expect.objectContaining({
                    id: projectId,
                    title: "Renamed",
                    remainingDays: expect.any(Number),
                    isOwner: true,
                })
            );
        });
    });

    describe("DELETE /api/v1/progress/project/delete", () => {
        it("returns 400 with an error body when projectId is absent", async () => {
            const agent = await createVerifiedUser();

            const res = await agent.delete(`${BASE}/delete`);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ message: expect.any(String) });
        });

        it("returns 200 with a plain message body on success", async () => {
            const agent = await createVerifiedUser();
            const projectId = await seedProject(agent);

            const res = await agent.delete(
                `${BASE}/delete?projectId=${projectId}`
            );

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ message: expect.any(String) });
        });
    });

    describe("GET /api/v1/progress/project/shared", () => {
        it("returns 200 with an array payload and a distinct empty-state message", async () => {
            const agent = await createVerifiedUser();

            const res = await agent.get(`${BASE}/shared`);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                message: "No shared projects",
                data: [],
            });
        });
    });

    describe("DELETE /api/v1/progress/project/leave", () => {
        it("returns 400 with an error body when projectId is absent", async () => {
            const agent = await createVerifiedUser();

            const res = await agent.delete(`${BASE}/leave`);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ message: expect.any(String) });
        });

        it("returns 200 with a plain message body on success", async () => {
            const ownerAgent = await createVerifiedUser();
            const memberAgent = await createVerifiedUser(
                "memberuser",
                "member@gmail.com"
            );
            const projectId = await seedProject(ownerAgent, {
                type: "team",
                members: ["memberuser"],
            });

            const res = await memberAgent.delete(
                `${BASE}/leave?projectId=${projectId}`
            );

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ message: expect.any(String) });
        });
    });

    describe("unknown project routes", () => {
        it("returns 404 with a plain error body", async () => {
            const res = await request(app).get(`${BASE}/does-not-exist`);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ message: expect.any(String) });
        });
    });
});
