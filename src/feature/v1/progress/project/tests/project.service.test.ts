import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";

vi.mock("../project.model", () => ({
    default: {
        create: vi.fn(),
        find: vi.fn(),
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
        deleteOne: vi.fn(),
    },
}));

vi.mock("../../../identity/user/user.model", () => ({
    default: {
        findById: vi.fn(),
    },
}));

vi.mock("../../../../../common/utils/validateMembers", () => ({
    validateMembers: vi.fn(),
}));

import ProjectModel from "../project.model";
import UserModel from "../../../identity/user/user.model";
import { validateMembers } from "../../../../../common/utils/validateMembers";
import {
    createProjectService,
    getProjectsService,
    getProjectByIdService,
    getProjectSearchService,
    updateProjectService,
    deleteProjectService,
    getSharedProjectsService,
    leaveProjectService,
} from "../project.service";
import { ProjectStatus, ProjectType } from "../types/project.enum";
import {
    BadRequestError,
    ForbiddenError,
    NotFoundError,
} from "../../../../../common/error/errorStatusCode";

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z");

// Memoized so that calling idEq("owner1") anywhere in this file always
// returns the SAME object reference. This matters because several tests
// both feed a value into the mocked service AND assert on it via
// toHaveBeenCalledWith/toEqual — two independently-created objects with
// their own vi.fn() "equals" closures would never be considered equal by
// deep-equality, even if they represent "the same id" conceptually.
const idCache = new Map<
    string,
    { equals: (b: unknown) => boolean; toString: () => string }
>();
const idEq = (a: string) => {
    if (!idCache.has(a)) {
        // Real ObjectIds compare by value, and callers may pass either
        // another ObjectId-like object or a raw string. Normalizing both
        // sides through String() mirrors that, so `equals` works whether
        // the service passes `user._id` (an object) or a plain id string.
        idCache.set(a, {
            equals: (b: unknown) => String(b) === a,
            toString: () => a,
        });
    }
    return idCache.get(a)!;
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
    vi.useRealTimers();
});

describe("project.service", () => {
    describe("createProjectService", () => {
        const baseInput = {
            userId: "owner1",
            title: "My Project",
            type: ProjectType.PERSONAL,
            dueDate: new Date("2026-01-10T00:00:00.000Z"),
            status: ProjectStatus.ACTIVE,
        };

        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(
                createProjectService(baseInput as any)
            ).rejects.toThrow(NotFoundError);
        });

        it("throws BadRequestError for a syntactically invalid due date", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (validateMembers as any).mockResolvedValue([]);

            await expect(
                createProjectService({
                    ...baseInput,
                    dueDate: new Date("not-a-date"),
                } as any)
            ).rejects.toThrow(BadRequestError);
        });

        it("throws BadRequestError when the due date is in the past", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (validateMembers as any).mockResolvedValue([]);

            await expect(
                createProjectService({
                    ...baseInput,
                    dueDate: new Date("2025-01-01T00:00:00.000Z"),
                } as any)
            ).rejects.toThrow(BadRequestError);
        });

        it("creates a personal project and returns the mapped shape", async () => {
            const ownerObjectId = idEq("owner1");
            (UserModel.findById as any).mockResolvedValue({
                _id: ownerObjectId,
            });
            (validateMembers as any).mockResolvedValue([]);
            (ProjectModel.create as any).mockResolvedValue({
                userId: { equals: (b: unknown) => b === ownerObjectId },
                title: "My Project",
                type: ProjectType.PERSONAL,
                documentation: undefined,
                githubRepo: undefined,
                status: ProjectStatus.ACTIVE,
                dueDate: new Date("2026-01-10T00:00:00.000Z"),
                members: [],
            });

            const result = await createProjectService(baseInput as any);

            expect(validateMembers).toHaveBeenCalledWith(
                "owner1",
                ProjectType.PERSONAL,
                undefined
            );
            expect(result.title).toBe("My Project");
            expect(result.remainingDays).toBe(9);
            expect(result.isOwner).toBe(true);
        });

        it("propagates a BadRequestError thrown by validateMembers", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (validateMembers as any).mockRejectedValue(
                new BadRequestError("Personal projects cannot have members")
            );

            await expect(
                createProjectService({
                    ...baseInput,
                    members: ["bob"],
                } as any)
            ).rejects.toThrow(BadRequestError);
            expect(ProjectModel.create).not.toHaveBeenCalled();
        });

        it("defaults type to PERSONAL when omitted", async () => {
            const ownerObjectId = idEq("owner1");
            (UserModel.findById as any).mockResolvedValue({
                _id: ownerObjectId,
            });
            (validateMembers as any).mockResolvedValue([]);
            (ProjectModel.create as any).mockResolvedValue({
                userId: { equals: (b: unknown) => b === ownerObjectId },
                title: "My Project",
                type: ProjectType.PERSONAL,
                dueDate: new Date("2026-01-10T00:00:00.000Z"),
                status: ProjectStatus.ACTIVE,
                members: [],
            });

            await createProjectService({
                userId: "owner1",
                title: "My Project",
                dueDate: new Date("2026-01-10T00:00:00.000Z"),
                status: ProjectStatus.ACTIVE,
            } as any);

            expect(validateMembers).toHaveBeenCalledWith(
                "owner1",
                ProjectType.PERSONAL,
                undefined
            );
        });
    });

    describe("getProjectsService", () => {
        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(
                getProjectsService({ userId: "missing" })
            ).rejects.toThrow(NotFoundError);
        });

        it("maps owned and member projects with the correct isOwner flag", async () => {
            const ownerId = idEq("owner1");
            (UserModel.findById as any).mockResolvedValue({ _id: ownerId });

            const ownedProject = {
                _id: "p1",
                userId: { _id: idEq("owner1") },
                title: "Owned",
                type: ProjectType.PERSONAL,
                documentation: "doc",
                githubRepo: "repo",
                status: ProjectStatus.ACTIVE,
                dueDate: new Date("2026-01-05T00:00:00.000Z"),
                members: [],
            };
            const memberProject = {
                _id: "p2",
                userId: { _id: idEq("someoneelse") },
                title: "Shared With Me",
                type: ProjectType.TEAM,
                documentation: undefined,
                githubRepo: undefined,
                status: ProjectStatus.ACTIVE,
                dueDate: new Date("2026-01-20T00:00:00.000Z"),
                members: ["owner1"],
            };

            (ProjectModel.find as any).mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    sort: vi
                        .fn()
                        .mockResolvedValue([ownedProject, memberProject]),
                }),
            });

            const result = await getProjectsService({ userId: "owner1" });

            expect(result).toHaveLength(2);
            expect(result[0].isOwner).toBe(true);
            expect(result[1].isOwner).toBe(false);
        });
    });

    describe("getProjectByIdService", () => {
        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(
                getProjectByIdService({ userId: "missing", projectId: "p1" })
            ).rejects.toThrow(NotFoundError);
        });

        it("throws NotFoundError when the project does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockReturnValue({
                populate: vi.fn().mockResolvedValue(null),
            });

            await expect(
                getProjectByIdService({ userId: "owner1", projectId: "p1" })
            ).rejects.toThrow(NotFoundError);
        });

        it("throws ForbiddenError when the user is neither owner nor member", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("outsider"),
            });
            (ProjectModel.findById as any).mockReturnValue({
                populate: vi.fn().mockResolvedValue({
                    userId: idEq("owner1"),
                    members: [idEq("member1")],
                    dueDate: new Date("2026-01-05T00:00:00.000Z"),
                }),
            });

            await expect(
                getProjectByIdService({ userId: "outsider", projectId: "p1" })
            ).rejects.toThrow(ForbiddenError);
        });

        it("succeeds for the owner", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockReturnValue({
                populate: vi.fn().mockResolvedValue({
                    _id: "p1",
                    userId: idEq("owner1"),
                    title: "Mine",
                    type: ProjectType.PERSONAL,
                    status: ProjectStatus.ACTIVE,
                    members: [],
                    dueDate: new Date("2026-01-05T00:00:00.000Z"),
                }),
            });

            const result = await getProjectByIdService({
                userId: "owner1",
                projectId: "p1",
            });

            expect(result.isOwner).toBe(true);
        });

        it("succeeds for a member (isOwner false)", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("member1"),
            });
            (ProjectModel.findById as any).mockReturnValue({
                populate: vi.fn().mockResolvedValue({
                    _id: "p1",
                    userId: idEq("owner1"),
                    title: "Team project",
                    type: ProjectType.TEAM,
                    status: ProjectStatus.ACTIVE,
                    members: [idEq("member1")],
                    dueDate: new Date("2026-01-05T00:00:00.000Z"),
                }),
            });

            const result = await getProjectByIdService({
                userId: "member1",
                projectId: "p1",
            });

            expect(result.isOwner).toBe(false);
        });

        it("treats a project with no members array as having no members", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("stranger"),
            });
            (ProjectModel.findById as any).mockReturnValue({
                populate: vi.fn().mockResolvedValue({
                    _id: "p1",
                    userId: idEq("owner1"),
                    title: "Solo project",
                    type: ProjectType.PERSONAL,
                    status: ProjectStatus.ACTIVE,
                    members: undefined,
                    dueDate: new Date("2026-01-05T00:00:00.000Z"),
                }),
            });

            // A non-owner accessing a project whose `members` field is
            // undefined must still be denied — proving the
            // `project.members ?? []` fallback correctly resolves to "no
            // members" rather than throwing on `undefined.some(...)`.
            await expect(
                getProjectByIdService({
                    userId: "stranger",
                    projectId: "p1",
                })
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe("getProjectSearchService", () => {
        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(
                getProjectSearchService({ userId: "missing" })
            ).rejects.toThrow(NotFoundError);
        });

        it("queries only the ownership $or when no filters are given", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.find as any).mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    sort: vi.fn().mockResolvedValue([]),
                }),
            });

            await getProjectSearchService({ userId: "owner1" });

            const calledWith = (ProjectModel.find as any).mock.calls[0][0];
            expect(calledWith).toEqual({
                $or: [{ userId: idEq("owner1") }, { members: idEq("owner1") }],
            });
        });

        it("combines multiple filters with $and", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.find as any).mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    sort: vi.fn().mockResolvedValue([]),
                }),
            });

            await getProjectSearchService({
                userId: "owner1",
                title: "Roadmap",
                type: ProjectType.TEAM,
                status: ProjectStatus.ACTIVE,
            });

            const calledWith = (ProjectModel.find as any).mock.calls[0][0];
            expect(calledWith.$and).toHaveLength(4); // ownership + 3 filters
            expect(calledWith.$and[1]).toEqual({
                title: { $regex: "Roadmap", $options: "i" },
            });
            expect(calledWith.$and[2]).toEqual({ type: ProjectType.TEAM });
            expect(calledWith.$and[3]).toEqual({
                status: ProjectStatus.ACTIVE,
            });
        });

        it("builds a same-day range filter for dueDate", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.find as any).mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    sort: vi.fn().mockResolvedValue([]),
                }),
            });

            await getProjectSearchService({
                userId: "owner1",
                dueDate: new Date("2026-03-15T14:30:00.000Z"),
            });

            const calledWith = (ProjectModel.find as any).mock.calls[0][0];
            const range = calledWith.$and[1].dueDate;
            expect(range.$gte.getHours()).toBe(0);
            expect(range.$lt.getTime() - range.$gte.getTime()).toBe(
                24 * 60 * 60 * 1000
            );
        });

        it("maps non-empty search results with the correct isOwner flag", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });

            const ownedResult = {
                _id: "p1",
                userId: { _id: idEq("owner1") },
                title: "Mine",
                type: ProjectType.PERSONAL,
                documentation: "doc",
                githubRepo: "repo",
                status: ProjectStatus.ACTIVE,
                dueDate: new Date("2026-01-05T00:00:00.000Z"),
                members: [],
            };
            const memberResult = {
                _id: "p2",
                userId: { _id: idEq("someoneelse") },
                title: "Shared",
                type: ProjectType.TEAM,
                documentation: undefined,
                githubRepo: undefined,
                status: ProjectStatus.ACTIVE,
                dueDate: new Date("2026-01-20T00:00:00.000Z"),
                members: ["owner1"],
            };

            (ProjectModel.find as any).mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    sort: vi
                        .fn()
                        .mockResolvedValue([ownedResult, memberResult]),
                }),
            });

            const result = await getProjectSearchService({
                userId: "owner1",
                title: "a",
            });

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual(
                expect.objectContaining({
                    id: "p1",
                    title: "Mine",
                    isOwner: true,
                })
            );
            expect(result[1]).toEqual(
                expect.objectContaining({
                    id: "p2",
                    title: "Shared",
                    isOwner: false,
                })
            );
        });
    });

    describe("updateProjectService", () => {
        const baseProject = {
            _id: "p1",
            userId: idEq("owner1"),
            title: "Old title",
            type: ProjectType.PERSONAL,
            status: ProjectStatus.ACTIVE,
            dueDate: new Date("2026-01-10T00:00:00.000Z"),
            members: [],
        };

        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(
                updateProjectService({
                    userId: "missing",
                    projectId: "p1",
                } as any)
            ).rejects.toThrow(NotFoundError);
        });

        it("throws NotFoundError when the project does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue(null);

            await expect(
                updateProjectService({
                    userId: "owner1",
                    projectId: "missing",
                } as any)
            ).rejects.toThrow(NotFoundError);
        });

        it("throws ForbiddenError when the requester is not the owner", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("someoneelse"),
            });
            (ProjectModel.findById as any).mockResolvedValue(baseProject);

            await expect(
                updateProjectService({
                    userId: "someoneelse",
                    projectId: "p1",
                    title: "New title",
                } as any)
            ).rejects.toThrow(ForbiddenError);
        });

        it("throws BadRequestError when no fields are provided", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue(baseProject);

            await expect(
                updateProjectService({
                    userId: "owner1",
                    projectId: "p1",
                } as any)
            ).rejects.toThrow(BadRequestError);
            expect(ProjectModel.findByIdAndUpdate).not.toHaveBeenCalled();
        });

        it("updates only the provided field", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue(baseProject);
            (ProjectModel.findByIdAndUpdate as any).mockResolvedValue({
                ...baseProject,
                title: "New title",
            });

            await updateProjectService({
                userId: "owner1",
                projectId: "p1",
                title: "New title",
            } as any);

            expect(ProjectModel.findByIdAndUpdate).toHaveBeenCalledWith(
                "p1",
                { title: "New title" },
                { new: true }
            );
            expect(validateMembers).not.toHaveBeenCalled();
        });

        it("updates documentation on its own", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue(baseProject);
            (ProjectModel.findByIdAndUpdate as any).mockResolvedValue({
                ...baseProject,
                documentation: "Updated docs",
            });

            await updateProjectService({
                userId: "owner1",
                projectId: "p1",
                documentation: "Updated docs",
            } as any);

            expect(ProjectModel.findByIdAndUpdate).toHaveBeenCalledWith(
                "p1",
                { documentation: "Updated docs" },
                { new: true }
            );
        });

        it("updates githubRepo on its own", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue(baseProject);
            (ProjectModel.findByIdAndUpdate as any).mockResolvedValue({
                ...baseProject,
                githubRepo: "new/repo",
            });

            await updateProjectService({
                userId: "owner1",
                projectId: "p1",
                githubRepo: "new/repo",
            } as any);

            expect(ProjectModel.findByIdAndUpdate).toHaveBeenCalledWith(
                "p1",
                { githubRepo: "new/repo" },
                { new: true }
            );
        });

        it("updates status on its own", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue(baseProject);
            (ProjectModel.findByIdAndUpdate as any).mockResolvedValue({
                ...baseProject,
                status: ProjectStatus.INACTIVE,
            });

            await updateProjectService({
                userId: "owner1",
                projectId: "p1",
                status: ProjectStatus.INACTIVE,
            } as any);

            expect(ProjectModel.findByIdAndUpdate).toHaveBeenCalledWith(
                "p1",
                { status: ProjectStatus.INACTIVE },
                { new: true }
            );
        });

        it("throws BadRequestError for a syntactically invalid due date", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue(baseProject);

            await expect(
                updateProjectService({
                    userId: "owner1",
                    projectId: "p1",
                    dueDate: new Date("not-a-date"),
                } as any)
            ).rejects.toThrow(BadRequestError);
        });

        it("throws BadRequestError when the new due date is in the past", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue(baseProject);

            await expect(
                updateProjectService({
                    userId: "owner1",
                    projectId: "p1",
                    dueDate: new Date("2020-01-01T00:00:00.000Z"),
                } as any)
            ).rejects.toThrow(BadRequestError);
        });

        it("successfully updates the due date to a valid future date", async () => {
            const newDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue(baseProject);
            (ProjectModel.findByIdAndUpdate as any).mockResolvedValue({
                ...baseProject,
                dueDate: newDueDate,
            });

            const result = await updateProjectService({
                userId: "owner1",
                projectId: "p1",
                dueDate: newDueDate,
            } as any);

            expect(ProjectModel.findByIdAndUpdate).toHaveBeenCalledWith(
                "p1",
                { dueDate: newDueDate },
                { new: true }
            );
            expect(result.dueDate).toEqual(newDueDate);
            expect(result.remainingDays).toBeGreaterThan(0);
        });

        it("returns remainingDays as undefined if the updated document unexpectedly has no dueDate", async () => {
            // Defensive branch: dueDate is `required: true` on the schema,
            // so this should be unreachable via real Mongo data, but the
            // code still guards against it explicitly — worth locking in.
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue(baseProject);
            (ProjectModel.findByIdAndUpdate as any).mockResolvedValue({
                ...baseProject,
                title: "Renamed",
                dueDate: undefined,
            });

            const result = await updateProjectService({
                userId: "owner1",
                projectId: "p1",
                title: "Renamed",
            } as any);

            expect(result.remainingDays).toBeUndefined();
        });

        it("revalidates members when members are provided, even if type is unchanged", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue({
                ...baseProject,
                type: ProjectType.TEAM,
            });
            (validateMembers as any).mockResolvedValue(["memberObjectId"]);
            (ProjectModel.findByIdAndUpdate as any).mockResolvedValue({
                ...baseProject,
                type: ProjectType.TEAM,
                members: ["memberObjectId"],
            });

            await updateProjectService({
                userId: "owner1",
                projectId: "p1",
                members: ["bob"],
            } as any);

            expect(validateMembers).toHaveBeenCalledWith(
                "owner1",
                ProjectType.TEAM, // resolved from the existing project type
                ["bob"]
            );
        });

        it("revalidates members when type changes, even if members are omitted", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue(baseProject); // PERSONAL
            (validateMembers as any).mockRejectedValue(
                new BadRequestError("Team projects require at least one member")
            );

            await expect(
                updateProjectService({
                    userId: "owner1",
                    projectId: "p1",
                    type: ProjectType.TEAM,
                } as any)
            ).rejects.toThrow(BadRequestError);
        });

        it("successfully converts a project to a new type when members validate", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue(baseProject); // PERSONAL
            (validateMembers as any).mockResolvedValue([idEq("m1")]);
            (ProjectModel.findByIdAndUpdate as any).mockResolvedValue({
                ...baseProject,
                type: ProjectType.TEAM,
                members: [idEq("m1")],
            });

            const result = await updateProjectService({
                userId: "owner1",
                projectId: "p1",
                type: ProjectType.TEAM,
                members: ["alice"],
            } as any);

            expect(ProjectModel.findByIdAndUpdate).toHaveBeenCalledWith(
                "p1",
                {
                    type: ProjectType.TEAM,
                    members: [idEq("m1")],
                },
                { new: true }
            );
            expect(result.type).toBe(ProjectType.TEAM);
        });

        it("skips member revalidation when type is unchanged and members are omitted", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue(baseProject);
            (ProjectModel.findByIdAndUpdate as any).mockResolvedValue({
                ...baseProject,
                status: ProjectStatus.INACTIVE,
            });

            await updateProjectService({
                userId: "owner1",
                projectId: "p1",
                status: ProjectStatus.INACTIVE,
            } as any);

            expect(validateMembers).not.toHaveBeenCalled();
        });

        it("throws NotFoundError if the project disappears between the check and the update", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue(baseProject);
            (ProjectModel.findByIdAndUpdate as any).mockResolvedValue(null);

            await expect(
                updateProjectService({
                    userId: "owner1",
                    projectId: "p1",
                    title: "New title",
                } as any)
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe("deleteProjectService", () => {
        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(
                deleteProjectService({ userId: "missing", projectId: "p1" })
            ).rejects.toThrow(NotFoundError);
        });

        it("throws NotFoundError when the project does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue(null);

            await expect(
                deleteProjectService({ userId: "owner1", projectId: "p1" })
            ).rejects.toThrow(NotFoundError);
        });

        it("throws ForbiddenError when the requester is not the owner", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("someoneelse"),
            });
            (ProjectModel.findById as any).mockResolvedValue({
                _id: "p1",
                userId: idEq("owner1"),
            });

            await expect(
                deleteProjectService({ userId: "someoneelse", projectId: "p1" })
            ).rejects.toThrow(ForbiddenError);
            expect(ProjectModel.deleteOne).not.toHaveBeenCalled();
        });

        it("deletes the project when the requester is the owner", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("owner1"),
            });
            (ProjectModel.findById as any).mockResolvedValue({
                _id: "p1",
                userId: idEq("owner1"),
            });

            await deleteProjectService({ userId: "owner1", projectId: "p1" });

            expect(ProjectModel.deleteOne).toHaveBeenCalledWith({
                _id: "p1",
            });
        });
    });

    describe("getSharedProjectsService", () => {
        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(
                getSharedProjectsService({ userId: "missing" })
            ).rejects.toThrow(NotFoundError);
        });

        it("queries for member-of but not owner-of, and maps results without isOwner", async () => {
            (UserModel.findById as any).mockResolvedValue({
                _id: idEq("member1"),
            });
            (ProjectModel.find as any).mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    sort: vi.fn().mockResolvedValue([
                        {
                            _id: "p1",
                            userId: { _id: "owner1" },
                            title: "Team project",
                            type: ProjectType.TEAM,
                            status: ProjectStatus.ACTIVE,
                            dueDate: new Date("2026-02-01T00:00:00.000Z"),
                            members: ["member1"],
                        },
                    ]),
                }),
            });

            const result = await getSharedProjectsService({
                userId: "member1",
            });

            expect(ProjectModel.find).toHaveBeenCalledWith({
                members: idEq("member1"),
                userId: { $ne: idEq("member1") },
            });
            expect(result[0]).not.toHaveProperty("isOwner");
        });
    });

    describe("leaveProjectService", () => {
        it("throws NotFoundError when the project does not exist", async () => {
            (ProjectModel.findById as any).mockResolvedValue(null);

            await expect(
                leaveProjectService({ userId: "member1", projectId: "p1" })
            ).rejects.toThrow(NotFoundError);
        });

        it("throws BadRequestError when the owner tries to leave", async () => {
            (ProjectModel.findById as any).mockResolvedValue({
                userId: { equals: (b: unknown) => b === "owner1" },
                members: [],
            });

            await expect(
                leaveProjectService({ userId: "owner1", projectId: "p1" })
            ).rejects.toThrow(BadRequestError);
        });

        it("throws BadRequestError when the requester is not a member", async () => {
            (ProjectModel.findById as any).mockResolvedValue({
                userId: { equals: (b: unknown) => b === "owner1" },
                members: [{ equals: (b: unknown) => b === "somebodyelse" }],
            });

            await expect(
                leaveProjectService({ userId: "outsider", projectId: "p1" })
            ).rejects.toThrow(BadRequestError);
        });

        it("throws BadRequestError when the project has no members array at all", async () => {
            // Exercises the `project.members ?? []` fallback: a non-owner
            // hitting this on a project with no members array must still
            // be rejected as "not a member", not throw on `undefined.some(...)`.
            (ProjectModel.findById as any).mockResolvedValue({
                userId: { equals: (b: unknown) => b === "owner1" },
                members: undefined,
            });

            await expect(
                leaveProjectService({ userId: "outsider", projectId: "p1" })
            ).rejects.toThrow(BadRequestError);
        });

        it("removes the requester from members and saves", async () => {
            const save = vi.fn().mockResolvedValue(true);
            const memberToLeave = { equals: (b: unknown) => b === "member1" };
            const otherMember = { equals: (b: unknown) => b === "member2" };

            const projectDoc = {
                userId: { equals: (b: unknown) => b === "owner1" },
                members: [memberToLeave, otherMember],
                save,
            };
            (ProjectModel.findById as any).mockResolvedValue(projectDoc);

            await leaveProjectService({
                userId: "member1",
                projectId: "p1",
            });

            expect(save).toHaveBeenCalled();
            expect(projectDoc.members).toEqual([otherMember]);
            expect(projectDoc.members).not.toContain(memberToLeave);
        });
    });
});
