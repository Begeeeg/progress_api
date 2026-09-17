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

// E2E journeys follow a real collaboration lifecycle across features:
// two people register and verify, one creates a team project, the other
// participates, and state changes made in one request are verified through
// later requests — the way an actual client would experience them.
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

/** Full register → verify journey, returning a cookie-persisting agent. */
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
            `onboardUser: register failed for ${email} — ` +
                `status ${registerRes.status}, body: ${JSON.stringify(
                    registerRes.body
                )}`
        );
    }

    const calls = sendVerificationEmail.mock.calls;
    const token = calls[calls.length - 1][2] as string;
    const verifyRes = await agent.get(
        `/api/v1/identity/auth/verify-email?token=${token}`
    );
    if (verifyRes.status !== 200) {
        throw new Error(
            `onboardUser: verify-email failed for ${email} — ` +
                `status ${verifyRes.status}, body: ${JSON.stringify(
                    verifyRes.body
                )}`
        );
    }

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

describe("Project E2E journeys", () => {
    it("runs a full team-collaboration lifecycle: onboard two users → create team project → member sees it as shared → owner updates → member leaves → project disappears from their view", async () => {
        const owner = await onboardUser("ownernow", "owner@gmail.com");
        const member = await onboardUser("membernow", "member@gmail.com");

        // 1. Owner creates a team project naming the member
        const createRes = await owner.post(BASE).send({
            title: "Team Build",
            type: "team",
            documentation: "the docs",
            githubRepo: "the-repo",
            dueDate: futureISO(14),
            members: ["membernow"],
        });
        expect(createRes.status).toBe(201);
        expect(createRes.body.data.isOwner).toBe(true);
        expect(createRes.body.data.members).toHaveLength(1);

        const list = await owner.get(BASE);
        const projectId = list.body.data[0].id;

        // 2. The member sees it in their own list, but not as owner
        const memberList = await member.get(BASE);
        expect(memberList.body.data).toHaveLength(1);
        expect(memberList.body.data[0].isOwner).toBe(false);

        // 3. ...and it shows up specifically under "shared with me"
        const sharedRes = await member.get(`${BASE}/shared`);
        expect(sharedRes.status).toBe(200);
        expect(sharedRes.body.data).toHaveLength(1);
        expect(sharedRes.body.data[0].title).toBe("Team Build");

        // 4. The owner's own "shared" view stays empty (it's their project)
        const ownerShared = await owner.get(`${BASE}/shared`);
        expect(ownerShared.body.data).toEqual([]);

        // 5. The member can read the project detail, but cannot update it
        const memberRead = await member.get(
            `${BASE}/getbyid?projectId=${projectId}`
        );
        expect(memberRead.status).toBe(200);

        const memberUpdate = await member
            .patch(`${BASE}/update?projectId=${projectId}`)
            .send({ title: "Hijacked" });
        expect(memberUpdate.status).toBe(403);

        // 6. The owner updates it, and the change is visible to the member
        const ownerUpdate = await owner
            .patch(`${BASE}/update?projectId=${projectId}`)
            .send({ title: "Renamed", status: "inactive" });
        expect(ownerUpdate.status).toBe(200);
        expect(ownerUpdate.body.data.title).toBe("Renamed");

        const memberReread = await member.get(
            `${BASE}/getbyid?projectId=${projectId}`
        );
        expect(memberReread.body.data.title).toBe("Renamed");
        expect(memberReread.body.data.status).toBe("inactive");

        // 7. The member leaves
        const leaveRes = await member.delete(
            `${BASE}/leave?projectId=${projectId}`
        );
        expect(leaveRes.status).toBe(200);

        // 8. It's gone from every one of the member's views, and they can
        // no longer read it at all
        expect((await member.get(BASE)).body.data).toEqual([]);
        expect((await member.get(`${BASE}/shared`)).body.data).toEqual([]);
        const readAfterLeave = await member.get(
            `${BASE}/getbyid?projectId=${projectId}`
        );
        expect(readAfterLeave.status).toBe(403);

        // 9. The owner still has it, now with no members
        const ownerAfter = await owner.get(
            `${BASE}/getbyid?projectId=${projectId}`
        );
        expect(ownerAfter.status).toBe(200);
        expect(ownerAfter.body.data.members).toHaveLength(0);

        // 10. The owner deletes it, and it's gone for good
        const deleteRes = await owner.delete(
            `${BASE}/delete?projectId=${projectId}`
        );
        expect(deleteRes.status).toBe(200);
        expect(
            (await owner.get(`${BASE}/getbyid?projectId=${projectId}`)).status
        ).toBe(404);
        expect((await owner.get(BASE)).body.data).toEqual([]);
    });

    it("blocks all project access for an account that registered but never verified", async () => {
        const unverified = request.agent(app);
        await unverified.post("/api/v1/identity/auth/register").send({
            username: "unverified",
            givenname: "given",
            surname: "surname",
            email: "unverified@gmail.com",
            password: "Password1",
            confirmPassword: "Password1",
        });

        // Registration sets a session cookie, but protectRoutes demands a
        // *verified* account — so every project route must reject with 403.
        const create = await unverified
            .post(BASE)
            .send({ title: "Nope", dueDate: futureISO() });
        expect(create.status).toBe(403);

        expect((await unverified.get(BASE)).status).toBe(403);
        expect((await unverified.get(`${BASE}/shared`)).status).toBe(403);
        expect((await unverified.get(`${BASE}/search`)).status).toBe(403);
    });

    it("keeps each user's personal projects fully isolated from the other", async () => {
        const alice = await onboardUser("aliceuser", "alice@gmail.com");
        const bob = await onboardUser("bobuser", "bob@gmail.com");

        await alice
            .post(BASE)
            .send({ title: "Alice Work", dueDate: futureISO() });
        await bob.post(BASE).send({ title: "Bob Work", dueDate: futureISO() });

        const aliceList = await alice.get(BASE);
        const bobList = await bob.get(BASE);
        expect(aliceList.body.data).toHaveLength(1);
        expect(aliceList.body.data[0].title).toBe("Alice Work");
        expect(bobList.body.data).toHaveLength(1);
        expect(bobList.body.data[0].title).toBe("Bob Work");

        // Bob cannot read, update, or delete Alice's project
        const aliceProjectId = aliceList.body.data[0].id;
        expect(
            (await bob.get(`${BASE}/getbyid?projectId=${aliceProjectId}`))
                .status
        ).toBe(403);
        expect(
            (
                await bob
                    .patch(`${BASE}/update?projectId=${aliceProjectId}`)
                    .send({ title: "Stolen" })
            ).status
        ).toBe(403);
        expect(
            (await bob.delete(`${BASE}/delete?projectId=${aliceProjectId}`))
                .status
        ).toBe(403);

        // Alice's project survived all of it
        const aliceAfter = await alice.get(
            `${BASE}/getbyid?projectId=${aliceProjectId}`
        );
        expect(aliceAfter.status).toBe(200);
        expect(aliceAfter.body.data.title).toBe("Alice Work");
    });

    it("supports finding a teammate by search and then adding them to a new team project", async () => {
        const owner = await onboardUser("ownernow", "owner@gmail.com");
        await onboardUser("teammate", "teammate@gmail.com");

        // 1. Owner finds the teammate through the public user search
        const searchRes = await request(app).get(
            "/api/v1/identity/user/search?username=teammate"
        );
        expect(searchRes.status).toBe(200);
        expect(searchRes.body.data).toHaveLength(1);
        const foundUsername = searchRes.body.data[0].username;

        // 2. ...and uses that username to staff a new team project
        const createRes = await owner.post(BASE).send({
            title: "Staffed",
            type: "team",
            dueDate: futureISO(),
            members: [foundUsername],
        });
        expect(createRes.status).toBe(201);
        expect(createRes.body.data.members).toHaveLength(1);

        // 3. Filtering by type returns the new team project
        const filtered = await owner.get(`${BASE}/search?type=team`);
        expect(filtered.status).toBe(200);
        expect(filtered.body.data).toHaveLength(1);
        expect(filtered.body.data[0].title).toBe("Staffed");
    });

    it("lets an owner convert a personal project into a team project mid-life", async () => {
        const owner = await onboardUser("ownernow", "owner@gmail.com");
        const member = await onboardUser("membernow", "member@gmail.com");

        // 1. Starts life as a personal project with no members
        const createRes = await owner
            .post(BASE)
            .send({ title: "Solo", dueDate: futureISO() });
        expect(createRes.status).toBe(201);
        expect(createRes.body.data.type).toBe("personal");

        const list = await owner.get(BASE);
        const projectId = list.body.data[0].id;

        // 2. Converting to team without members must be rejected
        const badConvert = await owner
            .patch(`${BASE}/update?projectId=${projectId}`)
            .send({ type: "team" });
        expect(badConvert.status).toBe(400);

        // 3. Converting with a member succeeds
        const convert = await owner
            .patch(`${BASE}/update?projectId=${projectId}`)
            .send({ type: "team", members: ["membernow"] });
        expect(convert.status).toBe(200);
        expect(convert.body.data.type).toBe("team");

        // 4. The new member now sees it as shared
        const shared = await member.get(`${BASE}/shared`);
        expect(shared.body.data).toHaveLength(1);
        expect(shared.body.data[0].title).toBe("Solo");
    });
});
