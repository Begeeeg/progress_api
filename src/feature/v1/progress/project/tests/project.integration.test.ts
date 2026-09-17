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

// Only outbound email is mocked; everything else runs against a real
// in-memory Mongo. Fixtures are created through the real auth API so that
// `protectRoutes` (which requires a *verified* account) is satisfied the
// same way it would be in production.
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
let ProjectModel: typeof import("../project.model").default;
let sendVerificationEmail: ReturnType<typeof vi.fn>;

const BASE = "/api/v1/progress/project";

const futureISO = (daysAhead = 7) =>
    new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
const pastISO = () =>
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

/** Registers + verifies a user, returning a cookie-persisting agent. */
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

    const me = await agent.get("/api/v1/identity/user/me");

    return { agent, userId: me.body?.data?.id as string, username };
};

const createProject = async (
    agent: ReturnType<typeof request.agent>,
    overrides: Record<string, unknown> = {}
) =>
    agent.post(BASE).send({
        title: "My Project",
        dueDate: futureISO(),
        ...overrides,
    });

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGO_URI = replSet.getUri();

    await mongoose.connect(process.env.MONGO_URI);
    app = (await import("../../../../../app")).default;
    ProjectModel = (await import("../project.model")).default;
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

describe("Project integration", () => {
    describe("POST /api/v1/progress/project", () => {
        it("requires authentication", async () => {
            const res = await request(app)
                .post(BASE)
                .send({ title: "X", dueDate: futureISO() });
            expect(res.status).toBe(401);
        });

        it("creates a personal project and persists it", async () => {
            const { agent } = await createVerifiedUser();

            const res = await createProject(agent, {
                title: "Personal",
                documentation: "docs",
                githubRepo: "repo",
            });

            expect(res.status).toBe(201);
            expect(res.body.data).toEqual(
                expect.objectContaining({
                    title: "Personal",
                    type: "personal",
                    isOwner: true,
                })
            );
            expect(res.body.data.remainingDays).toBeGreaterThan(0);

            const inDb = await ProjectModel.findOne({ title: "Personal" });
            expect(inDb).not.toBeNull();
        });

        it("rejects a past due date", async () => {
            const { agent } = await createVerifiedUser();

            const res = await createProject(agent, { dueDate: pastISO() });

            expect(res.status).toBe(400);
        });

        it("rejects a title longer than 15 characters", async () => {
            const { agent } = await createVerifiedUser();

            const res = await createProject(agent, {
                title: "a".repeat(16),
            });

            expect(res.status).toBe(400);
        });

        it("rejects a personal project that specifies members", async () => {
            const { agent } = await createVerifiedUser();
            await createVerifiedUser("memberuser", "member@gmail.com");

            const res = await createProject(agent, {
                type: "personal",
                members: ["memberuser"],
            });

            expect(res.status).toBe(400);
        });

        it("rejects a team project with no members", async () => {
            const { agent } = await createVerifiedUser();

            const res = await createProject(agent, {
                type: "team",
                members: [],
            });

            expect(res.status).toBe(400);
        });

        it("rejects a team project naming a nonexistent member", async () => {
            const { agent } = await createVerifiedUser();

            const res = await createProject(agent, {
                type: "team",
                members: ["ghostuser"],
            });

            expect(res.status).toBe(404);
        });

        it("rejects the owner listing themselves as a member", async () => {
            const { agent, username } = await createVerifiedUser();

            const res = await createProject(agent, {
                type: "team",
                members: [username],
            });

            expect(res.status).toBe(400);
        });

        it("creates a team project and resolves member usernames to ids", async () => {
            const { agent } = await createVerifiedUser();
            const member = await createVerifiedUser(
                "memberuser",
                "member@gmail.com"
            );

            const res = await createProject(agent, {
                type: "team",
                members: ["memberuser"],
            });

            expect(res.status).toBe(201);
            expect(res.body.data.members).toHaveLength(1);
            expect(String(res.body.data.members[0])).toBe(member.userId);
        });
    });

    describe("GET /api/v1/progress/project", () => {
        it("requires authentication", async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(401);
        });

        it("returns an empty array for a user with no projects", async () => {
            const { agent } = await createVerifiedUser();

            const res = await agent.get(BASE);

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual([]);
        });

        it("returns owned projects with isOwner true", async () => {
            const { agent } = await createVerifiedUser();
            await createProject(agent, { title: "Mine" });

            const res = await agent.get(BASE);

            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].isOwner).toBe(true);
        });

        it("includes projects the user is only a member of, with isOwner false", async () => {
            const { agent: ownerAgent } = await createVerifiedUser();
            const member = await createVerifiedUser(
                "memberuser",
                "member@gmail.com"
            );
            await createProject(ownerAgent, {
                title: "Team",
                type: "team",
                members: ["memberuser"],
            });

            const res = await member.agent.get(BASE);

            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].isOwner).toBe(false);
        });

        it("does not leak another user's unrelated projects", async () => {
            const { agent: ownerAgent } = await createVerifiedUser();
            await createProject(ownerAgent, { title: "Private" });

            const stranger = await createVerifiedUser(
                "stranger",
                "stranger@gmail.com"
            );
            const res = await stranger.agent.get(BASE);

            expect(res.body.data).toEqual([]);
        });
    });

    describe("GET /api/v1/progress/project/getbyid", () => {
        it("returns 400 when projectId is missing", async () => {
            const { agent } = await createVerifiedUser();

            const res = await agent.get(`${BASE}/getbyid`);

            expect(res.status).toBe(400);
        });

        it("returns the project for its owner", async () => {
            const { agent } = await createVerifiedUser();
            await createProject(agent, { title: "Findable" });
            const list = await agent.get(BASE);
            const projectId = list.body.data[0].id;

            const res = await agent.get(
                `${BASE}/getbyid?projectId=${projectId}`
            );

            expect(res.status).toBe(200);
            expect(res.body.data.title).toBe("Findable");
            expect(res.body.data.isOwner).toBe(true);
        });

        it("returns 403 for a user who is neither owner nor member", async () => {
            const { agent } = await createVerifiedUser();
            await createProject(agent, { title: "Private" });
            const list = await agent.get(BASE);
            const projectId = list.body.data[0].id;

            const stranger = await createVerifiedUser(
                "stranger",
                "stranger@gmail.com"
            );
            const res = await stranger.agent.get(
                `${BASE}/getbyid?projectId=${projectId}`
            );

            expect(res.status).toBe(403);
        });

        it("returns 404 for a well-formed but unknown project id", async () => {
            const { agent } = await createVerifiedUser();
            const unknownId = new mongoose.Types.ObjectId().toString();

            const res = await agent.get(
                `${BASE}/getbyid?projectId=${unknownId}`
            );

            expect(res.status).toBe(404);
        });
    });

    describe("GET /api/v1/progress/project/search", () => {
        const seed = async () => {
            const { agent } = await createVerifiedUser();
            await createProject(agent, { title: "Alpha API" });
            await createProject(agent, {
                title: "Beta",
                status: "inactive",
            });
            return agent;
        };

        it("requires authentication", async () => {
            const res = await request(app).get(`${BASE}/search`);
            expect(res.status).toBe(401);
        });

        it("returns all of the user's projects when no filter is given", async () => {
            const agent = await seed();

            const res = await agent.get(`${BASE}/search`);

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(2);
        });

        it("filters by a case-insensitive title fragment", async () => {
            const agent = await seed();

            const res = await agent.get(`${BASE}/search?title=alpha`);

            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].title).toBe("Alpha API");
        });

        it("filters by status", async () => {
            const agent = await seed();

            const res = await agent.get(`${BASE}/search?status=inactive`);

            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].title).toBe("Beta");
        });

        it("rejects an invalid status value", async () => {
            const agent = await seed();

            const res = await agent.get(`${BASE}/search?status=bogus`);

            expect(res.status).toBe(400);
        });

        it("rejects an invalid type value", async () => {
            const agent = await seed();

            const res = await agent.get(`${BASE}/search?type=bogus`);

            expect(res.status).toBe(400);
        });

        it("rejects an unparseable dueDate", async () => {
            const agent = await seed();

            const res = await agent.get(`${BASE}/search?dueDate=notadate`);

            expect(res.status).toBe(400);
        });

        it("returns an empty array when nothing matches", async () => {
            const agent = await seed();

            const res = await agent.get(`${BASE}/search?title=zzzznomatch`);

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual([]);
        });
    });

    describe("PATCH /api/v1/progress/project/update", () => {
        it("updates only the provided field", async () => {
            const { agent } = await createVerifiedUser();
            await createProject(agent, { title: "Before" });
            const list = await agent.get(BASE);
            const projectId = list.body.data[0].id;

            const res = await agent
                .patch(`${BASE}/update?projectId=${projectId}`)
                .send({ title: "After" });

            expect(res.status).toBe(200);
            expect(res.body.data.title).toBe("After");
        });

        it("returns 400 when no updatable field is supplied", async () => {
            const { agent } = await createVerifiedUser();
            await createProject(agent);
            const list = await agent.get(BASE);
            const projectId = list.body.data[0].id;

            const res = await agent
                .patch(`${BASE}/update?projectId=${projectId}`)
                .send({});

            expect(res.status).toBe(400);
        });

        it("returns 403 when a non-owner tries to update", async () => {
            const { agent: ownerAgent } = await createVerifiedUser();
            await createVerifiedUser("memberuser", "member@gmail.com");
            await createProject(ownerAgent, {
                title: "Team",
                type: "team",
                members: ["memberuser"],
            });
            const list = await ownerAgent.get(BASE);
            const projectId = list.body.data[0].id;

            const member = request.agent(app);
            await member.post("/api/v1/identity/auth/login").send({
                email: "member@gmail.com",
                password: "Password1",
            });

            const res = await member
                .patch(`${BASE}/update?projectId=${projectId}`)
                .send({ title: "Hijacked" });

            expect(res.status).toBe(403);
        });

        it("rejects a past due date", async () => {
            const { agent } = await createVerifiedUser();
            await createProject(agent);
            const list = await agent.get(BASE);
            const projectId = list.body.data[0].id;

            const res = await agent
                .patch(`${BASE}/update?projectId=${projectId}`)
                .send({ dueDate: pastISO() });

            expect(res.status).toBe(400);
        });

        it("returns 400 when projectId is missing", async () => {
            const { agent } = await createVerifiedUser();

            const res = await agent
                .patch(`${BASE}/update`)
                .send({ title: "X" });

            expect(res.status).toBe(400);
        });
    });

    describe("DELETE /api/v1/progress/project/delete", () => {
        it("deletes a project owned by the requester", async () => {
            const { agent } = await createVerifiedUser();
            await createProject(agent, { title: "Doomed" });
            const list = await agent.get(BASE);
            const projectId = list.body.data[0].id;

            const res = await agent.delete(
                `${BASE}/delete?projectId=${projectId}`
            );

            expect(res.status).toBe(200);
            expect(await ProjectModel.findById(projectId)).toBeNull();
        });

        it("returns 403 and keeps the project when a non-owner tries to delete", async () => {
            const { agent: ownerAgent } = await createVerifiedUser();
            await createProject(ownerAgent, { title: "Safe" });
            const list = await ownerAgent.get(BASE);
            const projectId = list.body.data[0].id;

            const stranger = await createVerifiedUser(
                "stranger",
                "stranger@gmail.com"
            );
            const res = await stranger.agent.delete(
                `${BASE}/delete?projectId=${projectId}`
            );

            expect(res.status).toBe(403);
            expect(await ProjectModel.findById(projectId)).not.toBeNull();
        });

        it("returns 400 when projectId is missing", async () => {
            const { agent } = await createVerifiedUser();

            const res = await agent.delete(`${BASE}/delete`);

            expect(res.status).toBe(400);
        });
    });

    describe("GET /api/v1/progress/project/shared", () => {
        it("returns a friendly message and empty data when nothing is shared", async () => {
            const { agent } = await createVerifiedUser();

            const res = await agent.get(`${BASE}/shared`);

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual([]);
            expect(res.body.message).toBe("No shared projects");
        });

        it("returns projects shared with the user but excludes their own", async () => {
            const { agent: ownerAgent } = await createVerifiedUser();
            const member = await createVerifiedUser(
                "memberuser",
                "member@gmail.com"
            );
            await createProject(ownerAgent, {
                title: "Shared",
                type: "team",
                members: ["memberuser"],
            });
            await createProject(member.agent, { title: "MyOwn" });

            const res = await member.agent.get(`${BASE}/shared`);

            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].title).toBe("Shared");
        });
    });

    describe("DELETE /api/v1/progress/project/leave", () => {
        it("removes the member from the project", async () => {
            const { agent: ownerAgent } = await createVerifiedUser();
            const member = await createVerifiedUser(
                "memberuser",
                "member@gmail.com"
            );
            await createProject(ownerAgent, {
                title: "Team",
                type: "team",
                members: ["memberuser"],
            });
            const list = await ownerAgent.get(BASE);
            const projectId = list.body.data[0].id;

            const res = await member.agent.delete(
                `${BASE}/leave?projectId=${projectId}`
            );

            expect(res.status).toBe(200);

            const after = await ProjectModel.findById(projectId);
            expect(after!.members).toHaveLength(0);
        });

        it("returns 400 when the owner tries to leave", async () => {
            const { agent: ownerAgent } = await createVerifiedUser();
            await createVerifiedUser("memberuser", "member@gmail.com");
            await createProject(ownerAgent, {
                title: "Team",
                type: "team",
                members: ["memberuser"],
            });
            const list = await ownerAgent.get(BASE);
            const projectId = list.body.data[0].id;

            const res = await ownerAgent.delete(
                `${BASE}/leave?projectId=${projectId}`
            );

            expect(res.status).toBe(400);
        });

        it("returns 400 when a non-member tries to leave", async () => {
            const { agent: ownerAgent } = await createVerifiedUser();
            await createProject(ownerAgent, { title: "Private" });
            const list = await ownerAgent.get(BASE);
            const projectId = list.body.data[0].id;

            const stranger = await createVerifiedUser(
                "stranger",
                "stranger@gmail.com"
            );
            const res = await stranger.agent.delete(
                `${BASE}/leave?projectId=${projectId}`
            );

            expect(res.status).toBe(400);
        });

        it("returns 400 when projectId is missing", async () => {
            const { agent } = await createVerifiedUser();

            const res = await agent.delete(`${BASE}/leave`);

            expect(res.status).toBe(400);
        });
    });
});