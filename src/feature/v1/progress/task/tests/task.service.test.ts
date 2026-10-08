import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

vi.mock("../../../identity/user/user.model", () => ({
    default: {
        findById: vi.fn(),
        find: vi.fn(),
    },
}));

vi.mock("../task.model", () => ({
    default: {
        create: vi.fn(),
        find: vi.fn(),
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
        deleteOne: vi.fn(),
    },
}));

vi.mock("../../project/project.service", () => ({
    getProjectByIdService: vi.fn(),
}));

import UserModel from "../../../identity/user/user.model";
import TaskModel from "../task.model";
import { getProjectByIdService } from "../../project/project.service";
import {
    createTaskService,
    getTasksService,
    getTaskByIdService,
    updateTaskService,
    deleteTaskService,
    leaveTaskService,
} from "../task.service";
import { TaskStatus } from "../types/task.enum";
import {
    BadRequestError,
    NotFoundError,
} from "../../../../../common/error/errorStatusCode";

const futureDate = (daysAhead = 30) =>
    new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
const pastDate = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

/** A project shape as returned by getProjectByIdService: `userId` is a raw
 * ObjectId-like reference, `members` is populated with `_id`/`username`. */
const projectFixture = (overrides: Record<string, unknown> = {}) => ({
    id: "project1",
    userId: "owner1",
    dueDate: futureDate(60),
    members: [{ _id: "member1", username: "memberuser" }],
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
    (UserModel.findById as any).mockResolvedValue({ _id: "user1" });
});

describe("task.service", () => {
    describe("createTaskService", () => {
        const baseInput = {
            userId: "owner1",
            projectId: "project1",
            title: "My Task",
            status: TaskStatus.PENDING,
            deadline: futureDate(10),
        } as any;

        it("creates a task with no assignees", async () => {
            (getProjectByIdService as any).mockResolvedValue(projectFixture());
            (TaskModel.create as any).mockResolvedValue({
                _id: "task1",
                projectId: "project1",
                title: "My Task",
                status: TaskStatus.PENDING,
                deadline: baseInput.deadline,
                assignedTo: [],
            });

            const result = await createTaskService(baseInput);

            expect(TaskModel.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: "user1",
                    projectId: "project1",
                    assignedTo: [],
                }),
            );
            expect(result).toEqual(
                expect.objectContaining({
                    id: "task1",
                    projectId: "project1",
                }),
            );
            expect(result.remainingDays).toBeGreaterThan(0);
        });

        it("resolves valid assignees who are project members", async () => {
            (getProjectByIdService as any).mockResolvedValue(projectFixture());
            (UserModel.find as any).mockReturnValue({
                select: vi
                    .fn()
                    .mockResolvedValue([
                        { _id: "member1", username: "memberuser" },
                    ]),
            });
            (TaskModel.create as any).mockResolvedValue({
                _id: "task1",
                projectId: "project1",
                deadline: baseInput.deadline,
                assignedTo: ["member1"],
            });

            await createTaskService({
                ...baseInput,
                assignedTo: ["memberuser"],
            });

            expect(TaskModel.create).toHaveBeenCalledWith(
                expect.objectContaining({ assignedTo: ["member1"] }),
            );
        });

        it("resolves the project owner as a valid assignee", async () => {
            (getProjectByIdService as any).mockResolvedValue(projectFixture());
            (UserModel.find as any).mockReturnValue({
                select: vi
                    .fn()
                    .mockResolvedValue([
                        { _id: "owner1", username: "owneruser" },
                    ]),
            });
            (TaskModel.create as any).mockResolvedValue({
                _id: "task1",
                projectId: "project1",
                deadline: baseInput.deadline,
                assignedTo: ["owner1"],
            });

            await createTaskService({
                ...baseInput,
                assignedTo: ["owneruser"],
            });

            expect(TaskModel.create).toHaveBeenCalledWith(
                expect.objectContaining({ assignedTo: ["owner1"] }),
            );
        });

        it("deduplicates repeated assignee usernames", async () => {
            (getProjectByIdService as any).mockResolvedValue(projectFixture());
            (UserModel.find as any).mockReturnValue({
                select: vi
                    .fn()
                    .mockResolvedValue([
                        { _id: "member1", username: "memberuser" },
                    ]),
            });
            (TaskModel.create as any).mockResolvedValue({
                _id: "task1",
                projectId: "project1",
                deadline: baseInput.deadline,
                assignedTo: ["member1"],
            });

            await createTaskService({
                ...baseInput,
                assignedTo: ["memberuser", "memberuser"],
            });

            expect(UserModel.find).toHaveBeenCalledWith({
                username: { $in: ["memberuser"] },
            });
        });

        it("throws NotFoundError when an assignee username does not exist", async () => {
            (getProjectByIdService as any).mockResolvedValue(projectFixture());
            // One of the two requested usernames resolves, the other
            // doesn't — a partial match, which is the realistic shape of
            // this failure and also exercises the `.map()` over a
            // non-empty `assigneeUsers` array.
            (UserModel.find as any).mockReturnValue({
                select: vi
                    .fn()
                    .mockResolvedValue([
                        { _id: "member1", username: "memberuser" },
                    ]),
            });

            await expect(
                createTaskService({
                    ...baseInput,
                    assignedTo: ["memberuser", "ghostuser"],
                }),
            ).rejects.toThrow(NotFoundError);
            expect(TaskModel.create).not.toHaveBeenCalled();
        });

        it("throws BadRequestError when an assignee is not a project member", async () => {
            (getProjectByIdService as any).mockResolvedValue(projectFixture());
            (UserModel.find as any).mockReturnValue({
                select: vi
                    .fn()
                    .mockResolvedValue([
                        { _id: "outsider1", username: "outsideruser" },
                    ]),
            });

            await expect(
                createTaskService({
                    ...baseInput,
                    assignedTo: ["outsideruser"],
                }),
            ).rejects.toThrow(BadRequestError);
            expect(TaskModel.create).not.toHaveBeenCalled();
        });

        it("throws BadRequestError for a syntactically invalid deadline", async () => {
            (getProjectByIdService as any).mockResolvedValue(projectFixture());

            await expect(
                createTaskService({
                    ...baseInput,
                    deadline: "not-a-date" as any,
                }),
            ).rejects.toThrow(BadRequestError);
        });

        it("throws BadRequestError when the deadline is after the project's due date", async () => {
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ dueDate: futureDate(5) }),
            );

            await expect(
                createTaskService({
                    ...baseInput,
                    deadline: futureDate(10), // later than the project's due date
                }),
            ).rejects.toThrow(BadRequestError);
        });

        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(createTaskService(baseInput)).rejects.toThrow(
                NotFoundError,
            );
            expect(getProjectByIdService).not.toHaveBeenCalled();
        });

        it("propagates access errors from getProjectByIdService", async () => {
            (getProjectByIdService as any).mockRejectedValue(
                new NotFoundError("Project not found"),
            );

            await expect(createTaskService(baseInput)).rejects.toThrow(
                NotFoundError,
            );
            expect(TaskModel.create).not.toHaveBeenCalled();
        });

        it("should allow the project owner as an assignee when members is undefined", async () => {
            const owner = {
                _id: "owner1",
                username: "owneruser",
            };

            vi.mocked(UserModel.find).mockReturnValue({
                select: vi.fn().mockResolvedValue([owner]),
            } as any);

            vi.mocked(getProjectByIdService).mockResolvedValue(
                projectFixture({
                    userId: "owner1",
                    members: undefined,
                }) as any,
            );

            vi.mocked(TaskModel.create).mockResolvedValue({
                _id: "task1",
                projectId: "project1",
                title: "Owner Task",
                notes: undefined,
                status: TaskStatus.PENDING,
                deadline: futureDate(10),
                assignedTo: [owner._id],
            } as any);

            const result = await createTaskService({
                userId: "owner1",
                projectId: "project1",
                title: "Owner Task",
                status: TaskStatus.PENDING,
                deadline: futureDate(10),
                assignedTo: ["owneruser"],
            });

            expect(result.assignedTo).toEqual([owner._id]);
            expect(TaskModel.create).toHaveBeenCalled();
        });
    });

    describe("getTasksService", () => {
        it("returns tasks mapped with remainingDays", async () => {
            (getProjectByIdService as any).mockResolvedValue(projectFixture());
            (TaskModel.find as any).mockReturnValue({
                sort: vi.fn().mockResolvedValue([
                    {
                        _id: "task1",
                        projectId: "project1",
                        title: "A",
                        deadline: futureDate(5),
                        assignedTo: [],
                    },
                ]),
            });

            const result = await getTasksService({
                userId: "owner1",
                projectId: "project1",
            });

            expect(result).toHaveLength(1);
            expect(result[0].remainingDays).toBeGreaterThan(0);
        });

        it("returns an empty array when the project has no tasks", async () => {
            (getProjectByIdService as any).mockResolvedValue(projectFixture());
            (TaskModel.find as any).mockReturnValue({
                sort: vi.fn().mockResolvedValue([]),
            });

            const result = await getTasksService({
                userId: "owner1",
                projectId: "project1",
            });

            expect(result).toEqual([]);
        });

        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(
                getTasksService({ userId: "missing", projectId: "project1" }),
            ).rejects.toThrow(NotFoundError);
        });

        it("propagates access errors from getProjectByIdService", async () => {
            (getProjectByIdService as any).mockRejectedValue(
                new NotFoundError("Project not found"),
            );

            await expect(
                getTasksService({ userId: "owner1", projectId: "gone" }),
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe("getTaskByIdService", () => {
        it("returns the task when it belongs to the given project", async () => {
            (TaskModel.findById as any).mockResolvedValue({
                _id: "task1",
                projectId: "project1",
                title: "Mine",
                deadline: futureDate(5),
                assignedTo: [],
            });
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );

            const result = await getTaskByIdService({
                userId: "owner1",
                projectId: "project1",
                taskId: "task1",
            });

            expect(result.title).toBe("Mine");
        });

        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(
                getTaskByIdService({
                    userId: "missing",
                    projectId: "project1",
                    taskId: "task1",
                }),
            ).rejects.toThrow(NotFoundError);
        });

        it("throws NotFoundError when the task does not exist", async () => {
            (TaskModel.findById as any).mockResolvedValue(null);

            await expect(
                getTaskByIdService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "gone",
                }),
            ).rejects.toThrow(NotFoundError);
            expect(getProjectByIdService).not.toHaveBeenCalled();
        });

        it("propagates access errors from getProjectByIdService", async () => {
            (TaskModel.findById as any).mockResolvedValue({
                _id: "task1",
                projectId: "project1",
            });
            (getProjectByIdService as any).mockRejectedValue(
                new NotFoundError("Project not found"),
            );

            await expect(
                getTaskByIdService({
                    userId: "stranger",
                    projectId: "project1",
                    taskId: "task1",
                }),
            ).rejects.toThrow(NotFoundError);
        });

        // --- IDOR regression: this is the exact bug fixed earlier. A task
        // must never be returned when its real projectId does not match
        // the projectId the caller proved access to, even if the caller
        // legitimately owns/belongs to *some other* project. ---
        it("throws NotFoundError when the task belongs to a different project than the one the caller has access to", async () => {
            (TaskModel.findById as any).mockResolvedValue({
                _id: "task1",
                projectId: "someOtherProject", // task actually belongs here
                title: "Not yours",
                deadline: futureDate(5),
                assignedTo: [],
            });
            // Caller legitimately has access to THIS project, but it's not
            // the one the task belongs to.
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );

            await expect(
                getTaskByIdService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "task1",
                }),
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe("updateTaskService", () => {
        const existingTask = () => ({
            _id: "task1",
            projectId: "project1",
            title: "Old title",
            status: TaskStatus.PENDING,
            deadline: futureDate(10),
            assignedTo: [],
        });

        it("updates only the provided field", async () => {
            (TaskModel.findById as any).mockResolvedValue(existingTask());
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );
            (TaskModel.findByIdAndUpdate as any).mockResolvedValue({
                ...existingTask(),
                title: "New title",
            });

            const result = await updateTaskService({
                userId: "owner1",
                projectId: "project1",
                taskId: "task1",
                title: "New title",
            } as any);

            expect(TaskModel.findByIdAndUpdate).toHaveBeenCalledWith(
                "task1",
                { title: "New title" },
                { new: true },
            );
            expect(result.title).toBe("New title");
        });

        it("updates notes on its own", async () => {
            (TaskModel.findById as any).mockResolvedValue(existingTask());
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );
            (TaskModel.findByIdAndUpdate as any).mockResolvedValue({
                ...existingTask(),
                notes: "Updated notes",
            });

            const result = await updateTaskService({
                userId: "owner1",
                projectId: "project1",
                taskId: "task1",
                notes: "Updated notes",
            } as any);

            expect(TaskModel.findByIdAndUpdate).toHaveBeenCalledWith(
                "task1",
                { notes: "Updated notes" },
                { new: true },
            );
            expect(result.notes).toBe("Updated notes");
        });

        it("updates status on its own", async () => {
            (TaskModel.findById as any).mockResolvedValue(existingTask());
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );
            (TaskModel.findByIdAndUpdate as any).mockResolvedValue({
                ...existingTask(),
                status: TaskStatus.COMPLETED,
            });

            const result = await updateTaskService({
                userId: "owner1",
                projectId: "project1",
                taskId: "task1",
                status: TaskStatus.COMPLETED,
            } as any);

            expect(TaskModel.findByIdAndUpdate).toHaveBeenCalledWith(
                "task1",
                { status: TaskStatus.COMPLETED },
                { new: true },
            );
            expect(result.status).toBe(TaskStatus.COMPLETED);
        });

        it("successfully updates the deadline to a valid earlier date", async () => {
            const newDeadline = futureDate(5);
            (TaskModel.findById as any).mockResolvedValue(existingTask());
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }), // dueDate is 60 days out
            );
            (TaskModel.findByIdAndUpdate as any).mockResolvedValue({
                ...existingTask(),
                deadline: newDeadline,
            });

            const result = await updateTaskService({
                userId: "owner1",
                projectId: "project1",
                taskId: "task1",
                deadline: newDeadline,
            } as any);

            expect(TaskModel.findByIdAndUpdate).toHaveBeenCalledWith(
                "task1",
                { deadline: newDeadline },
                { new: true },
            );
            expect(result.deadline).toEqual(newDeadline);
            expect(result.remainingDays).toBeGreaterThan(0);
        });

        it("throws BadRequestError when no field is provided", async () => {
            (TaskModel.findById as any).mockResolvedValue(existingTask());
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );

            await expect(
                updateTaskService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "task1",
                } as any),
            ).rejects.toThrow(BadRequestError);
            expect(TaskModel.findByIdAndUpdate).not.toHaveBeenCalled();
        });

        it("throws BadRequestError for an invalid deadline", async () => {
            (TaskModel.findById as any).mockResolvedValue(existingTask());
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );

            await expect(
                updateTaskService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "task1",
                    deadline: "nonsense" as any,
                } as any),
            ).rejects.toThrow(BadRequestError);
        });

        it("throws BadRequestError when the new deadline is after the project's due date", async () => {
            (TaskModel.findById as any).mockResolvedValue(existingTask());
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1", dueDate: futureDate(5) }),
            );

            await expect(
                updateTaskService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "task1",
                    deadline: futureDate(20),
                } as any),
            ).rejects.toThrow(BadRequestError);
        });

        it("re-resolves assignedTo when provided", async () => {
            (TaskModel.findById as any).mockResolvedValue(existingTask());
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );
            (UserModel.find as any).mockReturnValue({
                select: vi
                    .fn()
                    .mockResolvedValue([
                        { _id: "member1", username: "memberuser" },
                    ]),
            });
            (TaskModel.findByIdAndUpdate as any).mockResolvedValue({
                ...existingTask(),
                assignedTo: ["member1"],
            });

            await updateTaskService({
                userId: "owner1",
                projectId: "project1",
                taskId: "task1",
                assignedTo: ["memberuser"],
            } as any);

            expect(TaskModel.findByIdAndUpdate).toHaveBeenCalledWith(
                "task1",
                { assignedTo: ["member1"] },
                { new: true },
            );
        });

        it("clears assignedTo when given an empty array", async () => {
            (TaskModel.findById as any).mockResolvedValue({
                ...existingTask(),
                assignedTo: ["member1"],
            });
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );
            (TaskModel.findByIdAndUpdate as any).mockResolvedValue({
                ...existingTask(),
                assignedTo: [],
            });

            await updateTaskService({
                userId: "owner1",
                projectId: "project1",
                taskId: "task1",
                assignedTo: [],
            } as any);

            expect(TaskModel.findByIdAndUpdate).toHaveBeenCalledWith(
                "task1",
                { assignedTo: [] },
                { new: true },
            );
            expect(UserModel.find).not.toHaveBeenCalled();
        });

        it("throws NotFoundError when a re-resolved assignee username does not exist", async () => {
            (TaskModel.findById as any).mockResolvedValue(existingTask());
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );
            (UserModel.find as any).mockReturnValue({
                select: vi
                    .fn()
                    .mockResolvedValue([
                        { _id: "member1", username: "memberuser" },
                    ]),
            });

            await expect(
                updateTaskService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "task1",
                    assignedTo: ["memberuser", "ghostuser"],
                } as any),
            ).rejects.toThrow(NotFoundError);
        });

        it("throws BadRequestError when a re-resolved assignee is not a project member", async () => {
            (TaskModel.findById as any).mockResolvedValue(existingTask());
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );
            (UserModel.find as any).mockReturnValue({
                select: vi
                    .fn()
                    .mockResolvedValue([
                        { _id: "outsider1", username: "outsideruser" },
                    ]),
            });

            await expect(
                updateTaskService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "task1",
                    assignedTo: ["outsideruser"],
                } as any),
            ).rejects.toThrow(BadRequestError);
        });

        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(
                updateTaskService({
                    userId: "missing",
                    projectId: "project1",
                    taskId: "task1",
                    title: "x",
                } as any),
            ).rejects.toThrow(NotFoundError);
        });

        it("throws NotFoundError when the task does not exist", async () => {
            (TaskModel.findById as any).mockResolvedValue(null);

            await expect(
                updateTaskService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "gone",
                    title: "x",
                } as any),
            ).rejects.toThrow(NotFoundError);
        });

        // --- IDOR-adjacent: this cross-check already existed pre-fix, but
        // it's the same guard shape as the other two functions, so it's
        // worth locking in explicitly here too. ---
        it("throws NotFoundError when the task belongs to a different project than the one supplied", async () => {
            (TaskModel.findById as any).mockResolvedValue({
                ...existingTask(),
                projectId: "someOtherProject",
            });
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );

            await expect(
                updateTaskService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "task1",
                    title: "Hijack",
                } as any),
            ).rejects.toThrow(NotFoundError);
            expect(TaskModel.findByIdAndUpdate).not.toHaveBeenCalled();
        });

        it("throws NotFoundError if the task disappears between the check and the update", async () => {
            (TaskModel.findById as any).mockResolvedValue(existingTask());
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );
            (TaskModel.findByIdAndUpdate as any).mockResolvedValue(null);

            await expect(
                updateTaskService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "task1",
                    title: "x",
                } as any),
            ).rejects.toThrow(NotFoundError);
        });

        it("should allow the project owner as an assignee when members is undefined", async () => {
            const owner = {
                _id: "owner1",
                username: "owneruser",
            };

            const deadline = futureDate(10);

            vi.mocked(TaskModel.findById).mockResolvedValue({
                _id: "task1",
                projectId: "project1",
                title: "Old Title",
                deadline,
            } as any);

            vi.mocked(getProjectByIdService).mockResolvedValue(
                projectFixture({
                    userId: "owner1",
                    members: undefined,
                }) as any,
            );

            vi.mocked(UserModel.find).mockReturnValue({
                select: vi.fn().mockResolvedValue([owner]),
            } as any);

            vi.mocked(TaskModel.findByIdAndUpdate).mockResolvedValue({
                _id: "task1",
                projectId: "project1",
                title: "Old Title",
                deadline,
                assignedTo: [owner._id],
            } as any);

            const result = await updateTaskService({
                userId: "user1",
                projectId: "project1",
                taskId: "task1",
                assignedTo: ["owneruser"],
            });

            expect(result.assignedTo).toEqual([owner._id]);

            expect(TaskModel.findByIdAndUpdate).toHaveBeenCalledWith(
                "task1",
                {
                    assignedTo: [owner._id],
                },
                { new: true },
            );
        });
    });

    describe("deleteTaskService", () => {
        it("deletes the task when it belongs to the given project", async () => {
            (TaskModel.findById as any).mockResolvedValue({
                _id: "task1",
                projectId: "project1",
            });
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );
            (TaskModel.deleteOne as any).mockResolvedValue({
                deletedCount: 1,
            });

            await deleteTaskService({
                userId: "owner1",
                projectId: "project1",
                taskId: "task1",
            });

            expect(TaskModel.deleteOne).toHaveBeenCalledWith({
                _id: "task1",
            });
        });

        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(
                deleteTaskService({
                    userId: "missing",
                    projectId: "project1",
                    taskId: "task1",
                }),
            ).rejects.toThrow(NotFoundError);
        });

        it("throws NotFoundError when the task does not exist", async () => {
            (TaskModel.findById as any).mockResolvedValue(null);

            await expect(
                deleteTaskService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "gone",
                }),
            ).rejects.toThrow(NotFoundError);
            expect(TaskModel.deleteOne).not.toHaveBeenCalled();
        });

        it("propagates access errors from getProjectByIdService", async () => {
            (TaskModel.findById as any).mockResolvedValue({
                _id: "task1",
                projectId: "project1",
            });
            (getProjectByIdService as any).mockRejectedValue(
                new NotFoundError("Project not found"),
            );

            await expect(
                deleteTaskService({
                    userId: "stranger",
                    projectId: "project1",
                    taskId: "task1",
                }),
            ).rejects.toThrow(NotFoundError);
            expect(TaskModel.deleteOne).not.toHaveBeenCalled();
        });

        // --- IDOR regression: the critical fix. Before this was patched,
        // any authenticated user who had access to *some* project could
        // delete a task belonging to a completely unrelated project just
        // by pairing that task's id with a projectId they legitimately
        // had access to. This must now be blocked. ---
        it("throws NotFoundError and does not delete when the task belongs to a different project than the one the caller has access to", async () => {
            (TaskModel.findById as any).mockResolvedValue({
                _id: "task1",
                projectId: "someOtherProject",
            });
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );

            await expect(
                deleteTaskService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "task1",
                }),
            ).rejects.toThrow(NotFoundError);
            expect(TaskModel.deleteOne).not.toHaveBeenCalled();
        });
    });

    describe("leaveTaskService", () => {
        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(
                leaveTaskService({
                    userId: "missing",
                    projectId: "project1",
                    taskId: "task1",
                }),
            ).rejects.toThrow(NotFoundError);
        });

        it("throws NotFoundError when the task does not exist", async () => {
            (TaskModel.findById as any).mockResolvedValue(null);

            await expect(
                leaveTaskService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "gone",
                }),
            ).rejects.toThrow(NotFoundError);
        });

        it("removes the caller from the assignees when the task belongs to the given project", async () => {
            const userId = new Types.ObjectId();
            const otherAssigneeId = new Types.ObjectId();
            const task = {
                _id: "task1",
                projectId: "project1",
                assignedTo: [userId, otherAssigneeId],
                save: vi.fn().mockResolvedValue(undefined),
            };
            (TaskModel.findById as any).mockResolvedValue(task);
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );

            await leaveTaskService({
                userId: userId.toString(),
                projectId: "project1",
                taskId: "task1",
            });

            expect(task.assignedTo).toEqual([otherAssigneeId]);
            expect(task.save).toHaveBeenCalledOnce();
        });

        it("throws BadRequestError when the caller is not assigned to the task", async () => {
            const task = {
                _id: "task1",
                projectId: "project1",
                assignedTo: [],
                save: vi.fn(),
            };
            (TaskModel.findById as any).mockResolvedValue(task);
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );

            await expect(
                leaveTaskService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "task1",
                }),
            ).rejects.toThrow(BadRequestError);
            expect(task.save).not.toHaveBeenCalled();
        });

        it("throws BadRequestError when the task has no assignee list", async () => {
            const task = {
                _id: "task1",
                projectId: "project1",
                save: vi.fn(),
            };
            (TaskModel.findById as any).mockResolvedValue(task);
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );

            await expect(
                leaveTaskService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "task1",
                }),
            ).rejects.toThrow(BadRequestError);
            expect(task.save).not.toHaveBeenCalled();
        });

        it("throws NotFoundError when the task belongs to a different project", async () => {
            (TaskModel.findById as any).mockResolvedValue({
                _id: "task1",
                projectId: "otherProject",
                assignedTo: [],
                save: vi.fn(),
            });
            (getProjectByIdService as any).mockResolvedValue(
                projectFixture({ id: "project1" }),
            );

            await expect(
                leaveTaskService({
                    userId: "owner1",
                    projectId: "project1",
                    taskId: "task1",
                }),
            ).rejects.toThrow(NotFoundError);
        });

        it("propagates access errors from getProjectByIdService", async () => {
            (TaskModel.findById as any).mockResolvedValue({
                _id: "task1",
                projectId: "project1",
                assignedTo: [],
                save: vi.fn(),
            });
            (getProjectByIdService as any).mockRejectedValue(
                new NotFoundError("Project not found"),
            );

            await expect(
                leaveTaskService({
                    userId: "stranger",
                    projectId: "project1",
                    taskId: "task1",
                }),
            ).rejects.toThrow(NotFoundError);
        });
    });
});
