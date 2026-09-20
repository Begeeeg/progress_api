import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";

vi.mock("../task.service", () => ({
    createTaskService: vi.fn(),
    getTasksService: vi.fn(),
    getTaskByIdService: vi.fn(),
    updateTaskService: vi.fn(),
    deleteTaskService: vi.fn(),
}));

import * as taskService from "../task.service";
import {
    createTaskController,
    getTasksController,
    getTaskByIdController,
    updateTaskController,
    deleteTaskController,
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
        query: {},
        body: {},
        ...overrides,
    }) as unknown as Request;

beforeEach(() => {
    vi.clearAllMocks();
});

describe("task.controller", () => {
    describe("createTaskController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = { user: undefined, query: {} } as unknown as Request;
            const res = mockRes();

            await createTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(taskService.createTaskService).not.toHaveBeenCalled();
        });

        it("returns 400 when projectId is missing", async () => {
            const req = authedReq({ query: {} });
            const res = mockRes();

            await createTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(taskService.createTaskService).not.toHaveBeenCalled();
        });

        it("forwards body fields, projectId, and the authenticated userId; returns 201", async () => {
            const req = authedReq({
                query: { projectId: "project1" },
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
            const req = { user: undefined, query: {} } as unknown as Request;
            const res = mockRes();

            await getTasksController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("returns 400 when projectId is missing", async () => {
            const req = authedReq({ query: {} });
            const res = mockRes();

            await getTasksController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 200 with the project's tasks", async () => {
            const req = authedReq({ query: { projectId: "project1" } });
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
            const req = { user: undefined, query: {} } as unknown as Request;
            const res = mockRes();

            await getTaskByIdController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("returns 400 when projectId is missing", async () => {
            const req = authedReq({ query: { taskId: "task1" } });
            const res = mockRes();

            await getTaskByIdController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 400 when taskId is missing", async () => {
            const req = authedReq({ query: { projectId: "project1" } });
            const res = mockRes();

            await getTaskByIdController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 400 when either id is an array", async () => {
            const req = authedReq({
                query: { projectId: ["a", "b"], taskId: "task1" },
            });
            const res = mockRes();

            await getTaskByIdController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 200 with the requested task", async () => {
            const req = authedReq({
                query: { projectId: "project1", taskId: "task1" },
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
            const req = { user: undefined, query: {} } as unknown as Request;
            const res = mockRes();

            await updateTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("returns 400 with the correct message when projectId is missing", async () => {
            const req = authedReq({ query: { taskId: "task1" } });
            const res = mockRes();

            await updateTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid project id",
            });
        });

        it("returns 400 when taskId is missing", async () => {
            const req = authedReq({ query: { projectId: "project1" } });
            const res = mockRes();

            await updateTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid task id",
            });
        });

        it("forwards projectId, taskId, userId, and body fields; returns 200", async () => {
            const req = authedReq({
                query: { projectId: "project1", taskId: "task1" },
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
            const req = { user: undefined, query: {} } as unknown as Request;
            const res = mockRes();

            await deleteTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("returns 400 when projectId is missing", async () => {
            const req = authedReq({ query: { taskId: "task1" } });
            const res = mockRes();

            await deleteTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 400 when taskId is missing", async () => {
            const req = authedReq({ query: { projectId: "project1" } });
            const res = mockRes();

            await deleteTaskController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("deletes the task and returns 200 with no data field", async () => {
            const req = authedReq({
                query: { projectId: "project1", taskId: "task1" },
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
});
