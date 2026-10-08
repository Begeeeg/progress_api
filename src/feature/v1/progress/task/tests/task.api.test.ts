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
let sendVerificationEmail: ReturnType<typeof vi.fn>;

const PROJECT_BASE = "/api/v1/progress/project";

const futureISO = (daysAhead = 30) =>
    new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

const createVerifiedUser = async (
    username = "owneruser",
    email = "owner@gmail.com",
) => {
    const agent = request.agent(app);

    const registerRes = await agent
        .post("/api/v1/identity/auth/register")
        .send({
            username,
            givenname: "given",
            surname: "surname",
            email,
            password: "Password1",
            confirmPassword: "Password1",
        });
    if (registerRes.status !== 201) {
        throw new Error(
            `createVerifiedUser: register failed — status ${registerRes.status}, body: ${JSON.stringify(registerRes.body)}`,
        );
    }

    const calls = sendVerificationEmail.mock.calls;
    const token = calls[calls.length - 1][2] as string;
    await agent.get(`/api/v1/identity/auth/verify-email?token=${token}`);

    return agent;
};

const createProject = async (agent: ReturnType<typeof request.agent>) => {
    await agent
        .post(PROJECT_BASE)
        .send({ title: "Seed Project", dueDate: futureISO(60) });
    const list = await agent.get(PROJECT_BASE);
    return list.body.data[0].id as string;
};

const createTask = async (
    agent: ReturnType<typeof request.agent>,
    projectId: string,
) => {
    const res = await agent
        .post(`${PROJECT_BASE}/${projectId}/task`)
        .send({ title: "Seed Task", deadline: futureISO(10) });
    return res.body.data.id as string;
};

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGO_URI = replSet.getUri();

    await mongoose.connect(process.env.MONGO_URI);
    app = (await import("../../../../../app")).default;
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
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

describe("Task API contract", () => {
    describe("authentication contract", () => {
        it.each([
            ["POST", `${PROJECT_BASE}/x/task`],
            ["GET", `${PROJECT_BASE}/x/task`],
            ["GET", `${PROJECT_BASE}/x/task/y`],
            ["PATCH", `${PROJECT_BASE}/x/task/y`],
            ["DELETE", `${PROJECT_BASE}/x/task/y`],
            ["DELETE", `${PROJECT_BASE}/x/task/y/leave`],
        ])(
            "%s %s returns 401 with an error body when unauthenticated",
            async (method, path) => {
                const res = await (request(app) as any)
                    [method.toLowerCase()](path)
                    .send({});

                expect(res.status).toBe(401);
                expect(res.body).toEqual({ message: expect.any(String) });
            },
        );
    });

    describe("POST /api/v1/progress/project/:projectId/task", () => {
        it("returns 201 with the documented response shape", async () => {
            const agent = await createVerifiedUser();
            const projectId = await createProject(agent);

            const res = await agent
                .post(`${PROJECT_BASE}/${projectId}/task`)
                .send({
                    title: "Shaped",
                    notes: "some notes",
                    deadline: futureISO(5),
                });

            expect(res.status).toBe(201);
            expect(res.headers["content-type"]).toMatch(/json/);
            expect(res.body).toEqual({
                message: expect.any(String),
                data: {
                    id: expect.any(String),
                    projectId: expect.any(String),
                    title: "Shaped",
                    notes: "some notes",
                    status: expect.any(String),
                    deadline: expect.any(String),
                    assignedTo: expect.any(Array),
                    remainingDays: expect.any(Number),
                },
            });
        });

        it.each([
            ["missing title", { deadline: futureISO(5) }],
            ["empty title", { title: "", deadline: futureISO(5) }],
            ["missing deadline", { title: "X" }],
            ["unparseable deadline", { title: "X", deadline: "not-a-date" }],
            [
                "invalid status enum",
                { title: "X", deadline: futureISO(5), status: "bogus" },
            ],
            [
                "assignedTo not an array of strings",
                { title: "X", deadline: futureISO(5), assignedTo: [123] },
            ],
        ])("returns 400 with an error body for: %s", async (_label, body) => {
            const agent = await createVerifiedUser();
            const projectId = await createProject(agent);

            const res = await agent
                .post(`${PROJECT_BASE}/${projectId}/task`)
                .send(body);

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("message");
        });

        it("returns 400 with an error body for a malformed projectId", async () => {
            const agent = await createVerifiedUser();

            const res = await agent
                .post(`${PROJECT_BASE}/not-a-valid-id/task`)
                .send({ title: "X", deadline: futureISO(5) });

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ message: expect.any(String) });
        });

        it("returns 404 with an error body for a well-formed but unknown projectId", async () => {
            const agent = await createVerifiedUser();
            const unknownId = new mongoose.Types.ObjectId().toString();

            const res = await agent
                .post(`${PROJECT_BASE}/${unknownId}/task`)
                .send({ title: "X", deadline: futureISO(5) });

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ message: expect.any(String) });
        });

        it("returns 403 with an error body when the caller lacks project access", async () => {
            const owner = await createVerifiedUser();
            const projectId = await createProject(owner);
            const stranger = await createVerifiedUser(
                "stranger",
                "stranger@gmail.com",
            );

            const res = await stranger
                .post(`${PROJECT_BASE}/${projectId}/task`)
                .send({ title: "X", deadline: futureISO(5) });

            expect(res.status).toBe(403);
            expect(res.body).toEqual({ message: expect.any(String) });
        });
    });

    describe("GET /api/v1/progress/project/:projectId/task", () => {
        it("returns 200 with an array payload", async () => {
            const agent = await createVerifiedUser();
            const projectId = await createProject(agent);
            await createTask(agent, projectId);

            const res = await agent.get(`${PROJECT_BASE}/${projectId}/task`);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                message: expect.any(String),
                data: expect.any(Array),
            });
        });
    });

    describe("GET /api/v1/progress/project/:projectId/task/:taskId", () => {
        it("returns 200 with the documented single-task shape", async () => {
            const agent = await createVerifiedUser();
            const projectId = await createProject(agent);
            const taskId = await createTask(agent, projectId);

            const res = await agent.get(
                `${PROJECT_BASE}/${projectId}/task/${taskId}`,
            );

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual(
                expect.objectContaining({
                    id: taskId,
                    title: expect.any(String),
                    remainingDays: expect.any(Number),
                }),
            );
        });

        it("returns 404 with an error body for a cross-project task/projectId pairing", async () => {
            const agent = await createVerifiedUser();
            await createProject(agent); // projectA (implicit "first" project)
            const projectBRes = await agent
                .post(PROJECT_BASE)
                .send({ title: "Proj B", dueDate: futureISO(60) });
            const projectList = await agent.get(PROJECT_BASE);
            const projectA = projectList.body.data.find(
                (p: any) => p.title === "Seed Project",
            ).id;
            const projectB = projectList.body.data.find(
                (p: any) => p.title === "Proj B",
            ).id;
            const taskInA = await createTask(agent, projectA);

            const res = await agent.get(
                `${PROJECT_BASE}/${projectB}/task/${taskInA}`,
            );

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ message: expect.any(String) });
        });
    });

    describe("PATCH /api/v1/progress/project/:projectId/task/:taskId", () => {
        it("returns 200 with the documented updated shape", async () => {
            const agent = await createVerifiedUser();
            const projectId = await createProject(agent);
            const taskId = await createTask(agent, projectId);

            const res = await agent
                .patch(`${PROJECT_BASE}/${projectId}/task/${taskId}`)
                .send({ title: "Renamed" });

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual(
                expect.objectContaining({
                    id: taskId,
                    title: "Renamed",
                }),
            );
        });

        it.each([
            ["empty title", { title: "" }],
            ["unparseable deadline", { deadline: "not-a-date" }],
            ["invalid status enum", { status: "bogus" }],
        ])("returns 400 with an error body for: %s", async (_label, body) => {
            const agent = await createVerifiedUser();
            const projectId = await createProject(agent);
            const taskId = await createTask(agent, projectId);

            const res = await agent
                .patch(`${PROJECT_BASE}/${projectId}/task/${taskId}`)
                .send(body);

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("message");
        });
    });

    describe("DELETE /api/v1/progress/project/:projectId/task/:taskId", () => {
        it("returns 200 with a plain message body on success", async () => {
            const agent = await createVerifiedUser();
            const projectId = await createProject(agent);
            const taskId = await createTask(agent, projectId);

            const res = await agent.delete(
                `${PROJECT_BASE}/${projectId}/task/${taskId}`,
            );

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ message: expect.any(String) });
        });
    });

    describe("DELETE /api/v1/progress/project/:projectId/task/:taskId/leave", () => {
        it("returns 200 with a plain message body on success", async () => {
            const owner = await createVerifiedUser();
            const projectId = await createProject(owner);
            const taskRes = await owner
                .post(`${PROJECT_BASE}/${projectId}/task`)
                .send({
                    title: "Assigned task",
                    deadline: futureISO(10),
                    assignedTo: ["owneruser"],
                });
            expect(taskRes.status).toBe(201);
            const taskId = taskRes.body.data.id as string;

            const res = await owner.delete(
                `${PROJECT_BASE}/${projectId}/task/${taskId}/leave`,
            );

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                message: expect.any(String),
            });
        });
    });

    describe("unknown task routes", () => {
        it("returns 404 with a plain error body", async () => {
            // A single extra segment beyond `:taskId` matches no route at
            // all — this is what genuinely exercises the global 404
            // handler now that `/:projectId/task/...` is a catch-all for
            // otherwise-shaped requests.
            const res = await request(app).get(
                `${PROJECT_BASE}/x/task/y/does-not-exist`,
            );

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ message: expect.any(String) });
        });
    });
});
