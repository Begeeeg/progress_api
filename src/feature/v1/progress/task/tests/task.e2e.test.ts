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

const onboardUser = async (username: string, email: string) => {
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
            `onboardUser: register failed for ${email} — status ${registerRes.status}, body: ${JSON.stringify(registerRes.body)}`,
        );
    }

    const calls = sendVerificationEmail.mock.calls;
    const token = calls[calls.length - 1][2] as string;
    const verifyRes = await agent.get(
        `/api/v1/identity/auth/verify-email?token=${token}`,
    );
    if (verifyRes.status !== 200) {
        throw new Error(
            `onboardUser: verify-email failed for ${email} — status ${verifyRes.status}, body: ${JSON.stringify(verifyRes.body)}`,
        );
    }

    return agent;
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

describe("Task E2E journeys", () => {
    it("runs a team task lifecycle including a member leaving their assignment", async () => {
        const owner = await onboardUser("ownernow", "owner@gmail.com");
        const member = await onboardUser("membernow", "member@gmail.com");
        const stranger = await onboardUser("strangernow", "stranger@gmail.com");

        // 1. Owner creates a team project with the member on it
        await owner.post(PROJECT_BASE).send({
            title: "Launch Plan",
            type: "team",
            dueDate: futureISO(60),
            members: ["membernow"],
        });
        const projectList = await owner.get(PROJECT_BASE);
        const projectId = projectList.body.data[0].id;

        // 2. Owner creates a task assigned to the member
        const createRes = await owner
            .post(`${PROJECT_BASE}/${projectId}/task`)
            .send({
                title: "Write launch doc",
                deadline: futureISO(14),
                assignedTo: ["membernow"],
            });
        expect(createRes.status).toBe(201);
        const taskId = createRes.body.data.id;

        // 3. The member (not the owner) can see the task through the
        // project they belong to
        const memberView = await member.get(
            `${PROJECT_BASE}/${projectId}/task/${taskId}`,
        );
        expect(memberView.status).toBe(200);
        expect(memberView.body.data.title).toBe("Write launch doc");

        // 4. The stranger — who has no relationship to the project at all —
        // is denied, distinctly from a "not found" (403, since the project
        // itself is inaccessible to them)
        const strangerView = await stranger.get(
            `${PROJECT_BASE}/${projectId}/task/${taskId}`,
        );
        expect(strangerView.status).toBe(403);

        // 5. The member updates the task's status
        const statusUpdate = await member
            .patch(`${PROJECT_BASE}/${projectId}/task/${taskId}`)
            .send({ status: "in_progress" });
        expect(statusUpdate.status).toBe(200);
        expect(statusUpdate.body.data.status).toBe("in_progress");

        // 6. The owner sees the updated status too
        const ownerView = await owner.get(
            `${PROJECT_BASE}/${projectId}/task/${taskId}`,
        );
        expect(ownerView.body.data.status).toBe("in_progress");

        // 7. The member leaves the task; the task remains available to the project
        const leaveRes = await member.delete(
            `${PROJECT_BASE}/${projectId}/task/${taskId}/leave`,
        );
        expect(leaveRes.status).toBe(200);
        const afterLeave = await owner.get(
            `${PROJECT_BASE}/${projectId}/task/${taskId}`,
        );
        expect(afterLeave.status).toBe(200);
        expect(afterLeave.body.data.assignedTo).toHaveLength(0);

        // 8. The owner reassigns the task to themself
        const reassign = await owner
            .patch(`${PROJECT_BASE}/${projectId}/task/${taskId}`)
            .send({ assignedTo: ["ownernow"] });
        expect(reassign.status).toBe(200);
        expect(reassign.body.data.assignedTo).toHaveLength(1);

        // 9. The task list for the project now reflects all changes
        const finalList = await owner.get(`${PROJECT_BASE}/${projectId}/task`);
        expect(finalList.body.data).toHaveLength(1);
        expect(finalList.body.data[0].status).toBe("in_progress");

        // 10. Owner deletes the task
        const deleteRes = await owner.delete(
            `${PROJECT_BASE}/${projectId}/task/${taskId}`,
        );
        expect(deleteRes.status).toBe(200);
        const emptyList = await owner.get(`${PROJECT_BASE}/${projectId}/task`);
        expect(emptyList.body.data).toEqual([]);
    });

    it("prevents a project owner from using a task in one of their own projects to reach a task in a completely different project they also own (IDOR regression, full journey)", async () => {
        const owner = await onboardUser("ownernow", "owner@gmail.com");

        // Owner legitimately owns two, entirely separate projects
        await owner
            .post(PROJECT_BASE)
            .send({ title: "Project Alpha", dueDate: futureISO(60) });
        await owner
            .post(PROJECT_BASE)
            .send({ title: "Project Beta", dueDate: futureISO(60) });
        const list = await owner.get(PROJECT_BASE);
        const alphaId = list.body.data.find(
            (p: any) => p.title === "Project Alpha",
        ).id;
        const betaId = list.body.data.find(
            (p: any) => p.title === "Project Beta",
        ).id;

        // A sensitive task lives only in Alpha
        const taskRes = await owner
            .post(`${PROJECT_BASE}/${alphaId}/task`)
            .send({ title: "Alpha secret", deadline: futureISO(10) });
        const alphaTaskId = taskRes.body.data.id;

        // Even though the SAME owner legitimately has access to Beta, they
        // cannot read, update, or delete Alpha's task by pairing its id
        // with Beta's projectId — access to a project id must not leak
        // access to tasks that don't actually belong to it.
        const readAttempt = await owner.get(
            `${PROJECT_BASE}/${betaId}/task/${alphaTaskId}`,
        );
        expect(readAttempt.status).toBe(404);

        const updateAttempt = await owner
            .patch(`${PROJECT_BASE}/${betaId}/task/${alphaTaskId}`)
            .send({ title: "Tampered" });
        expect(updateAttempt.status).toBe(404);

        const deleteAttempt = await owner.delete(
            `${PROJECT_BASE}/${betaId}/task/${alphaTaskId}`,
        );
        expect(deleteAttempt.status).toBe(404);

        // The task is untouched and still reachable through its real project
        const realRead = await owner.get(
            `${PROJECT_BASE}/${alphaId}/task/${alphaTaskId}`,
        );
        expect(realRead.status).toBe(200);
        expect(realRead.body.data.title).toBe("Alpha secret");
    });

    it("rejects a task deadline that outlives the project once the project's own due date is tightened", async () => {
        const owner = await onboardUser("ownernow", "owner@gmail.com");

        await owner.post(PROJECT_BASE).send({
            title: "Shift Deadline",
            dueDate: futureISO(60),
        });
        const list = await owner.get(PROJECT_BASE);
        const projectId = list.body.data[0].id;

        // Task is created validly, well within the project's original window
        const taskRes = await owner
            .post(`${PROJECT_BASE}/${projectId}/task`)
            .send({ title: "Mid-project task", deadline: futureISO(40) });
        expect(taskRes.status).toBe(201);
        const taskId = taskRes.body.data.id;

        // Owner tightens the project's own due date to something earlier
        // than the task's existing deadline
        const tighten = await owner
            .patch(`${PROJECT_BASE}/${projectId}`)
            .send({ dueDate: futureISO(10) });
        expect(tighten.status).toBe(200);

        // The existing task record itself is untouched (no cascading
        // re-validation on unrelated updates)...
        const stillThere = await owner.get(
            `${PROJECT_BASE}/${projectId}/task/${taskId}`,
        );
        expect(stillThere.status).toBe(200);

        // ...but any *new* attempt to push the task's deadline out to its
        // old value now correctly fails against the tightened project window
        const pushOut = await owner
            .patch(`${PROJECT_BASE}/${projectId}/task/${taskId}`)
            .send({ deadline: futureISO(40) });
        expect(pushOut.status).toBe(400);
    });
});
