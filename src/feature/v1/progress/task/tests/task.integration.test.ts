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
let TaskModel: typeof import("../task.model").default;
let sendVerificationEmail: ReturnType<typeof vi.fn>;

const PROJECT_BASE = "/api/v1/progress/project";

const futureISO = (daysAhead = 30) =>
    new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
const pastISO = () =>
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

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
            `createVerifiedUser: register failed for ${email} — status ${registerRes.status}, body: ${JSON.stringify(registerRes.body)}`,
        );
    }

    const calls = sendVerificationEmail.mock.calls;
    const token = calls[calls.length - 1][2] as string;
    const verifyRes = await agent.get(
        `/api/v1/identity/auth/verify-email?token=${token}`,
    );
    if (verifyRes.status !== 200) {
        throw new Error(
            `createVerifiedUser: verify-email failed for ${email} — status ${verifyRes.status}`,
        );
    }

    return { agent, username };
};

const createProject = async (
    agent: ReturnType<typeof request.agent>,
    overrides: Record<string, unknown> = {},
) => {
    const res = await agent.post(PROJECT_BASE).send({
        title: "Parent Project",
        dueDate: futureISO(60),
        ...overrides,
    });
    if (res.status !== 201) {
        throw new Error(
            `createProject failed — status ${res.status}, body: ${JSON.stringify(res.body)}`,
        );
    }
    const list = await agent.get(PROJECT_BASE);
    return list.body.data.find(
        (p: any) => p.title === (overrides.title ?? "Parent Project"),
    ).id as string;
};

const createTask = async (
    agent: ReturnType<typeof request.agent>,
    projectId: string,
    overrides: Record<string, unknown> = {},
) => {
    const res = await agent
        .post(`${PROJECT_BASE}/${projectId}/task`)
        .send({ title: "A Task", deadline: futureISO(10), ...overrides });
    if (res.status !== 201) {
        throw new Error(
            `createTask failed — status ${res.status}, body: ${JSON.stringify(res.body)}`,
        );
    }
    return res.body.data.id as string;
};

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGO_URI = replSet.getUri();

    await mongoose.connect(process.env.MONGO_URI);
    app = (await import("../../../../../app")).default;
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    TaskModel = (await import("../task.model")).default;
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

describe("Task integration", () => {
    describe("POST /api/v1/progress/project/:projectId/task", () => {
        it("requires authentication", async () => {
            const res = await request(app).post(`${PROJECT_BASE}/x/task`);
            expect(res.status).toBe(401);
        });

        it("creates a task with no assignees", async () => {
            const { agent } = await createVerifiedUser();
            const projectId = await createProject(agent);

            const res = await agent
                .post(`${PROJECT_BASE}/${projectId}/task`)
                .send({ title: "First task", deadline: futureISO(5) });

            expect(res.status).toBe(201);
            expect(res.body.data.title).toBe("First task");
            expect(res.body.data.remainingDays).toBeGreaterThan(0);

            const inDb = await TaskModel.findOne({ title: "First task" });
            expect(inDb).not.toBeNull();
        });

        it("returns 403 when the caller has no access to the project", async () => {
            const owner = await createVerifiedUser();
            const projectId = await createProject(owner.agent);
            const stranger = await createVerifiedUser(
                "stranger",
                "stranger@gmail.com",
            );

            const res = await stranger.agent
                .post(`${PROJECT_BASE}/${projectId}/task`)
                .send({ title: "Intruder task", deadline: futureISO(5) });

            expect(res.status).toBe(403);
        });

        it("rejects a deadline in the past", async () => {
            const { agent } = await createVerifiedUser();
            const projectId = await createProject(agent);

            const res = await agent
                .post(`${PROJECT_BASE}/${projectId}/task`)
                .send({ title: "Late", deadline: pastISO() });

            expect(res.status).toBe(400);
        });

        it("rejects a deadline after the project's due date", async () => {
            const { agent } = await createVerifiedUser();
            const projectId = await createProject(agent, {
                dueDate: futureISO(10),
            });

            const res = await agent
                .post(`${PROJECT_BASE}/${projectId}/task`)
                .send({ title: "Too late", deadline: futureISO(30) });

            expect(res.status).toBe(400);
        });

        it("assigns a valid project member by username", async () => {
            const owner = await createVerifiedUser();
            const member = await createVerifiedUser(
                "memberuser",
                "member@gmail.com",
            );
            const projectId = await createProject(owner.agent, {
                type: "team",
                members: ["memberuser"],
            });

            const res = await owner.agent
                .post(`${PROJECT_BASE}/${projectId}/task`)
                .send({
                    title: "Assigned",
                    deadline: futureISO(5),
                    assignedTo: ["memberuser"],
                });

            expect(res.status).toBe(201);
            expect(res.body.data.assignedTo).toHaveLength(1);
        });

        it("rejects assigning a user who is not a project member", async () => {
            const owner = await createVerifiedUser();
            await createVerifiedUser("outsider", "outsider@gmail.com");
            const projectId = await createProject(owner.agent);

            const res = await owner.agent
                .post(`${PROJECT_BASE}/${projectId}/task`)
                .send({
                    title: "Bad assignment",
                    deadline: futureISO(5),
                    assignedTo: ["outsider"],
                });

            expect(res.status).toBe(400);
        });

        it("returns 404 when assigning a username that doesn't exist", async () => {
            const { agent } = await createVerifiedUser();
            const projectId = await createProject(agent);

            const res = await agent
                .post(`${PROJECT_BASE}/${projectId}/task`)
                .send({
                    title: "Ghost assignment",
                    deadline: futureISO(5),
                    assignedTo: ["nosuchuser"],
                });

            expect(res.status).toBe(404);
        });

        it("returns 404 for a well-formed but nonexistent project id", async () => {
            const { agent } = await createVerifiedUser();
            const unknownId = new mongoose.Types.ObjectId().toString();

            const res = await agent
                .post(`${PROJECT_BASE}/${unknownId}/task`)
                .send({ title: "X", deadline: futureISO(5) });

            expect(res.status).toBe(404);
        });

        it("returns 400 for a malformed project id (not a valid ObjectId)", async () => {
            const { agent } = await createVerifiedUser();

            const res = await agent
                .post(`${PROJECT_BASE}/not-a-valid-id/task`)
                .send({ title: "X", deadline: futureISO(5) });

            expect(res.status).toBe(400);
        });
    });

    describe("GET /api/v1/progress/project/:projectId/task", () => {
        it("requires authentication", async () => {
            const res = await request(app).get(`${PROJECT_BASE}/x/task`);
            expect(res.status).toBe(401);
        });

        it("returns all tasks for a project the caller has access to", async () => {
            const { agent } = await createVerifiedUser();
            const projectId = await createProject(agent);
            await createTask(agent, projectId, { title: "Task A" });
            await createTask(agent, projectId, { title: "Task B" });

            const res = await agent.get(`${PROJECT_BASE}/${projectId}/task`);

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(2);
        });

        it("returns 403 for a project the caller has no access to", async () => {
            const owner = await createVerifiedUser();
            const projectId = await createProject(owner.agent);
            const stranger = await createVerifiedUser(
                "stranger",
                "stranger@gmail.com",
            );

            const res = await stranger.agent.get(
                `${PROJECT_BASE}/${projectId}/task`,
            );

            expect(res.status).toBe(403);
        });
    });

    describe("GET /api/v1/progress/project/:projectId/task/:taskId", () => {
        it("returns the task when it belongs to the given project", async () => {
            const { agent } = await createVerifiedUser();
            const projectId = await createProject(agent);
            const taskId = await createTask(agent, projectId, {
                title: "Findable",
            });

            const res = await agent.get(
                `${PROJECT_BASE}/${projectId}/task/${taskId}`,
            );

            expect(res.status).toBe(200);
            expect(res.body.data.title).toBe("Findable");
        });

        // --- IDOR regression at the HTTP layer ---
        it("returns 404 when the task belongs to a different project than the one supplied, even if the caller owns both", async () => {
            const { agent } = await createVerifiedUser();
            const projectA = await createProject(agent, { title: "Proj A" });
            const projectB = await createProject(agent, { title: "Proj B" });
            const taskInA = await createTask(agent, projectA, {
                title: "Belongs to A",
            });

            const res = await agent.get(
                `${PROJECT_BASE}/${projectB}/task/${taskInA}`,
            );

            expect(res.status).toBe(404);
        });

        it("returns 403 when the caller has no access to the named project at all", async () => {
            const owner = await createVerifiedUser();
            const projectId = await createProject(owner.agent);
            const taskId = await createTask(owner.agent, projectId);
            const stranger = await createVerifiedUser(
                "stranger",
                "stranger@gmail.com",
            );

            const res = await stranger.agent.get(
                `${PROJECT_BASE}/${projectId}/task/${taskId}`,
            );

            expect(res.status).toBe(403);
        });

        it("returns 500 for a malformed taskId", async () => {
            const { agent } = await createVerifiedUser();
            const projectId = await createProject(agent);

            const res = await agent.get(
                `${PROJECT_BASE}/${projectId}/task/not-a-valid-id`,
            );

            expect(res.status).toBe(500);
        });

        it("returns 400 for a malformed projectId", async () => {
            const { agent } = await createVerifiedUser();
            const projectId = await createProject(agent);
            const taskId = await createTask(agent, projectId);

            const res = await agent.get(
                `${PROJECT_BASE}/not-a-valid-id/task/${taskId}`,
            );

            expect(res.status).toBe(400);
        });
    });

    describe("PATCH /api/v1/progress/project/:projectId/task/:taskId", () => {
        it("updates only the provided field", async () => {
            const { agent } = await createVerifiedUser();
            const projectId = await createProject(agent);
            const taskId = await createTask(agent, projectId, {
                title: "Before",
            });

            const res = await agent
                .patch(`${PROJECT_BASE}/${projectId}/task/${taskId}`)
                .send({ title: "After" });

            expect(res.status).toBe(200);
            expect(res.body.data.title).toBe("After");
        });

        it("returns 400 when no field is supplied", async () => {
            const { agent } = await createVerifiedUser();
            const projectId = await createProject(agent);
            const taskId = await createTask(agent, projectId);

            const res = await agent
                .patch(`${PROJECT_BASE}/${projectId}/task/${taskId}`)
                .send({});

            expect(res.status).toBe(400);
        });

        // --- IDOR regression at the HTTP layer ---
        it("returns 404 when the task belongs to a different project than the one supplied", async () => {
            const { agent } = await createVerifiedUser();
            const projectA = await createProject(agent, { title: "Proj A" });
            const projectB = await createProject(agent, { title: "Proj B" });
            const taskInA = await createTask(agent, projectA);

            const res = await agent
                .patch(`${PROJECT_BASE}/${projectB}/task/${taskInA}`)
                .send({ title: "Hijacked" });

            expect(res.status).toBe(404);
        });

        it("rejects a deadline after the project's due date", async () => {
            const { agent } = await createVerifiedUser();
            const projectId = await createProject(agent, {
                dueDate: futureISO(10),
            });
            const taskId = await createTask(agent, projectId, {
                deadline: futureISO(5),
            });

            const res = await agent
                .patch(`${PROJECT_BASE}/${projectId}/task/${taskId}`)
                .send({ deadline: futureISO(30) });

            expect(res.status).toBe(400);
        });
    });

    describe("DELETE /api/v1/progress/project/:projectId/task/:taskId", () => {
        it("deletes the task when it belongs to the given project", async () => {
            const { agent } = await createVerifiedUser();
            const projectId = await createProject(agent);
            const taskId = await createTask(agent, projectId);

            const res = await agent.delete(
                `${PROJECT_BASE}/${projectId}/task/${taskId}`,
            );

            expect(res.status).toBe(200);
            expect(await TaskModel.findById(taskId)).toBeNull();
        });

        // --- IDOR regression: the critical fix at the HTTP layer. Before
        // the fix, an owner of ANY project could delete a task belonging
        // to a completely different project by pairing that task's id with
        // a projectId they legitimately had access to. ---
        it("returns 404 and does not delete when the task belongs to a different project than the one supplied", async () => {
            const { agent } = await createVerifiedUser();
            const projectA = await createProject(agent, { title: "Proj A" });
            const projectB = await createProject(agent, { title: "Proj B" });
            const taskInA = await createTask(agent, projectA, {
                title: "Protected",
            });

            const res = await agent.delete(
                `${PROJECT_BASE}/${projectB}/task/${taskInA}`,
            );

            expect(res.status).toBe(404);
            expect(await TaskModel.findById(taskInA)).not.toBeNull();
        });

        it("returns 403 and does not delete when the caller has no access to the project", async () => {
            const owner = await createVerifiedUser();
            const projectId = await createProject(owner.agent);
            const taskId = await createTask(owner.agent, projectId);
            const stranger = await createVerifiedUser(
                "stranger",
                "stranger@gmail.com",
            );

            const res = await stranger.agent.delete(
                `${PROJECT_BASE}/${projectId}/task/${taskId}`,
            );

            expect(res.status).toBe(403);
            expect(await TaskModel.findById(taskId)).not.toBeNull();
        });
    });

    describe("DELETE /api/v1/progress/project/:projectId/task/:taskId/leave", () => {
        it("removes the caller's assignment without deleting the task or other assignments", async () => {
            const owner = await createVerifiedUser();
            const member = await createVerifiedUser(
                "memberuser",
                "member@gmail.com",
            );
            const projectId = await createProject(owner.agent, {
                type: "team",
                members: ["memberuser"],
            });
            const taskId = await createTask(owner.agent, projectId, {
                assignedTo: ["memberuser", "owneruser"],
            });

            const res = await member.agent.delete(
                `${PROJECT_BASE}/${projectId}/task/${taskId}/leave`,
            );

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                message: "Left task successfully",
            });
            const updatedTask = await TaskModel.findById(taskId);
            expect(updatedTask).not.toBeNull();
            expect(updatedTask!.assignedTo).toHaveLength(1);
        });

        it("returns 400 when the caller is not assigned to the task", async () => {
            const owner = await createVerifiedUser();
            const member = await createVerifiedUser(
                "memberuser",
                "member@gmail.com",
            );
            const projectId = await createProject(owner.agent, {
                type: "team",
                members: ["memberuser"],
            });
            const taskId = await createTask(owner.agent, projectId, {
                assignedTo: ["memberuser"],
            });

            const res = await owner.agent.delete(
                `${PROJECT_BASE}/${projectId}/task/${taskId}/leave`,
            );

            expect(res.status).toBe(400);
            expect(await TaskModel.findById(taskId)).not.toBeNull();
        });

        it("returns 404 and leaves the task unchanged when the supplied project does not own it", async () => {
            const { agent } = await createVerifiedUser();
            const projectA = await createProject(agent, { title: "Proj A" });
            const projectB = await createProject(agent, { title: "Proj B" });
            const taskId = await createTask(agent, projectA, {
                assignedTo: ["owneruser"],
            });

            const res = await agent.delete(
                `${PROJECT_BASE}/${projectB}/task/${taskId}/leave`,
            );

            expect(res.status).toBe(404);
            expect((await TaskModel.findById(taskId))!.assignedTo).toHaveLength(
                1,
            );
        });
    });
});
