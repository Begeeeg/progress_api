import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";

vi.mock("../task.service", () => ({
    createTaskService: vi.fn(),
    getTasksService: vi.fn(),
    getTaskByIdService: vi.fn(),
    updateTaskService: vi.fn(),
    deleteTaskService: vi.fn(),
    leaveTaskService: vi.fn(),
}));

import * as taskService from "../task.service";
import {
    createTaskController,
    getTasksController,
    getTaskByIdController,
    updateTaskController,
    deleteTaskController,
    leaveTaskController,
} from "../task.controller";
import { TaskStatus } from "../types/task.enum";

const mockRes = () => {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response;
};

const authedReq = (overrides: Partial<Request> = {}): Request =>
    ({
        user: { _id: { toString: () => "user1" } },
        params: {},
        body: {},
        ...overrides,
    }) as unknown as Request;

beforeEach(() => {
    vi.clearAllMocks();
});

describe("task.controller", () => {
    // Note throughout this file: `projectId`/`taskId` now arrive via
    // `req.params`, supplied by Express from the nested route
    // `/project/:projectId/task/:taskId`. A missing or array-shaped id is
    // no longer a scenario reachable at the controller level the way it
    // was with `req.query` — Express simply won't match a route with a
    // missing path segment, so those cases were removed here and are
    // instead implicitly covered by hitting the real routes in the
    // integration/API test suites.

    describe("createTaskController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = { user: undefined, params: {} } as unknown as Request;
            const res = mockRes();

            await createTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(taskService.createTaskService).not.toHaveBeenCalled();
        });

        it("returns 400 when projectId is not a string", async () => {
            const req = authedReq({ params: { projectId: ["project1"] } });
            const res = mockRes();

            await createTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid project id",
            });
            expect(taskService.createTaskService).not.toHaveBeenCalled();
        });

        it("forwards body fields, projectId, and the authenticated userId; returns 201", async () => {
            const req = authedReq({
                params: { projectId: "project1" },
                body: {
                    title: "New task",
                    notes: "notes",
                    status: TaskStatus.PENDING,
                    deadline: "2026-06-01",
                    assignedTo: ["alice"],
                },
            });
            const res = mockRes();
            const created = { id: "task1", title: "New task" };
            (taskService.createTaskService as any).mockResolvedValue(created);

            await createTaskController(req, res);

            expect(taskService.createTaskService).toHaveBeenCalledWith({
                userId: "user1",
                projectId: "project1",
                title: "New task",
                notes: "notes",
                status: TaskStatus.PENDING,
                deadline: "2026-06-01",
                assignedTo: ["alice"],
            });
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                message: "Created task successfully",
                data: created,
            });
        });
    });

    describe("getTasksController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = { user: undefined, params: {} } as unknown as Request;
            const res = mockRes();

            await getTasksController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("returns 400 when projectId is not a string", async () => {
            const req = authedReq({ params: { projectId: ["project1"] } });
            const res = mockRes();

            await getTasksController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid project id",
            });
            expect(taskService.getTasksService).not.toHaveBeenCalled();
        });

        it("returns 200 with the project's tasks", async () => {
            const req = authedReq({ params: { projectId: "project1" } });
            const res = mockRes();
            const tasks = [{ id: "task1" }];
            (taskService.getTasksService as any).mockResolvedValue(tasks);

            await getTasksController(req, res);

            expect(taskService.getTasksService).toHaveBeenCalledWith({
                userId: "user1",
                projectId: "project1",
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Fetched tasks successfully",
                data: tasks,
            });
        });
    });

    describe("getTaskByIdController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = { user: undefined, params: {} } as unknown as Request;
            const res = mockRes();

            await getTaskByIdController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("returns 400 when projectId is not a string", async () => {
            const req = authedReq({
                params: { projectId: ["project1"], taskId: "task1" },
            });
            const res = mockRes();

            await getTaskByIdController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid project id",
            });
            expect(taskService.getTaskByIdService).not.toHaveBeenCalled();
        });

        it("returns 400 when taskId is not a string", async () => {
            const req = authedReq({
                params: { projectId: "project1", taskId: ["task1"] },
            });
            const res = mockRes();

            await getTaskByIdController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid project id",
            });
            expect(taskService.getTaskByIdService).not.toHaveBeenCalled();
        });

        it("returns 200 with the requested task", async () => {
            const req = authedReq({
                params: { projectId: "project1", taskId: "task1" },
            });
            const res = mockRes();
            const task = { id: "task1", title: "Mine" };
            (taskService.getTaskByIdService as any).mockResolvedValue(task);

            await getTaskByIdController(req, res);

            expect(taskService.getTaskByIdService).toHaveBeenCalledWith({
                userId: "user1",
                projectId: "project1",
                taskId: "task1",
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Fetched tasks successfully",
                data: task,
            });
        });
    });

    describe("updateTaskController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = { user: undefined, params: {} } as unknown as Request;
            const res = mockRes();

            await updateTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("returns 400 when projectId is not a string", async () => {
            const req = authedReq({
                params: { projectId: ["project1"], taskId: "task1" },
            });
            const res = mockRes();

            await updateTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid project id",
            });
            expect(taskService.updateTaskService).not.toHaveBeenCalled();
        });

        it("returns 400 when taskId is not a string", async () => {
            const req = authedReq({
                params: { projectId: "project1", taskId: ["task1"] },
            });
            const res = mockRes();

            await updateTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid project id",
            });
            expect(taskService.updateTaskService).not.toHaveBeenCalled();
        });

        it("forwards projectId, taskId, userId, and body fields; returns 200", async () => {
            const req = authedReq({
                params: { projectId: "project1", taskId: "task1" },
                body: { title: "Renamed", status: TaskStatus.COMPLETED },
            });
            const res = mockRes();
            const updated = { id: "task1", title: "Renamed" };
            (taskService.updateTaskService as any).mockResolvedValue(updated);

            await updateTaskController(req, res);

            expect(taskService.updateTaskService).toHaveBeenCalledWith({
                userId: "user1",
                projectId: "project1",
                taskId: "task1",
                title: "Renamed",
                notes: undefined,
                assignedTo: undefined,
                status: TaskStatus.COMPLETED,
                deadline: undefined,
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Updated task successfully",
                data: updated,
            });
        });
    });

    describe("deleteTaskController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = { user: undefined, params: {} } as unknown as Request;
            const res = mockRes();

            await deleteTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("returns 400 when projectId is not a string", async () => {
            const req = authedReq({
                params: { projectId: ["project1"], taskId: "task1" },
            });
            const res = mockRes();

            await deleteTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid project id",
            });
            expect(taskService.deleteTaskService).not.toHaveBeenCalled();
        });

        it("returns 400 when taskId is not a string", async () => {
            const req = authedReq({
                params: { projectId: "project1", taskId: ["task1"] },
            });
            const res = mockRes();

            await deleteTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid project id",
            });
            expect(taskService.deleteTaskService).not.toHaveBeenCalled();
        });

        it("deletes the task and returns 200 with no data field", async () => {
            const req = authedReq({
                params: { projectId: "project1", taskId: "task1" },
            });
            const res = mockRes();

            await deleteTaskController(req, res);

            expect(taskService.deleteTaskService).toHaveBeenCalledWith({
                userId: "user1",
                projectId: "project1",
                taskId: "task1",
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Deleted task successfully",
            });
        });
    });

    describe("leaveTaskController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = { user: undefined, params: {} } as unknown as Request;
            const res = mockRes();

            await leaveTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(taskService.leaveTaskService).not.toHaveBeenCalled();
        });

        it("returns 400 when projectId or taskId is not a string", async () => {
            const invalidProjectReq = authedReq({
                params: { projectId: ["project1"], taskId: "task1" },
            });
            const projectRes = mockRes();

            await leaveTaskController(invalidProjectReq, projectRes);

            expect(projectRes.status).toHaveBeenCalledWith(400);
            expect(taskService.leaveTaskService).not.toHaveBeenCalled();

            const invalidTaskReq = authedReq({
                params: { projectId: "project1", taskId: ["task1"] },
            });
            const taskRes = mockRes();

            await leaveTaskController(invalidTaskReq, taskRes);

            expect(taskRes.status).toHaveBeenCalledWith(400);
            expect(taskService.leaveTaskService).not.toHaveBeenCalled();
        });

        it("forwards projectId, taskId, and userId; returns 200", async () => {
            const req = authedReq({
                params: { projectId: "project1", taskId: "task1" },
            });
            const res = mockRes();

            await leaveTaskController(req, res);

            expect(taskService.leaveTaskService).toHaveBeenCalledWith({
                userId: "user1",
                projectId: "project1",
                taskId: "task1",
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Left task successfully",
            });
        });
    });
});
