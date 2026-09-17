import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";

vi.mock("../project.service", () => ({
    createProjectService: vi.fn(),
    getProjectsService: vi.fn(),
    getProjectByIdService: vi.fn(),
    getProjectSearchService: vi.fn(),
    updateProjectService: vi.fn(),
    deleteProjectService: vi.fn(),
    getSharedProjectsService: vi.fn(),
    leaveProjectService: vi.fn(),
}));

import * as projectService from "../project.service";
import {
    createProjectController,
    getProjectsController,
    getProjectByIdController,
    getProjectSearchController,
    updateProjectController,
    deleteProjectController,
    getSharedProjectController,
    leaveProjectController,
} from "../project.controller";
import { ProjectStatus, ProjectType } from "../types/project.enum";

const mockRes = () => {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response;
};

const authedReq = (overrides: Record<string, unknown> = {}) =>
    ({
        user: { _id: { toString: () => "user123" } },
        body: {},
        query: {},
        ...overrides,
    } as unknown as Request);

beforeEach(() => {
    vi.clearAllMocks();
});

describe("project.controller", () => {
    describe("createProjectController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = { user: undefined, body: {} } as unknown as Request;
            const res = mockRes();

            await createProjectController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(projectService.createProjectService).not.toHaveBeenCalled();
        });

        it("forwards body fields plus the authenticated userId, returns 201", async () => {
            const req = authedReq({
                body: {
                    title: "New project",
                    type: ProjectType.TEAM,
                    documentation: "docs",
                    githubRepo: "repo",
                    dueDate: new Date("2026-06-01"),
                    status: ProjectStatus.ACTIVE,
                    members: ["bob"],
                },
            });
            const res = mockRes();
            const created = { title: "New project" };
            (projectService.createProjectService as any).mockResolvedValue(
                created
            );

            await createProjectController(req, res);

            expect(projectService.createProjectService).toHaveBeenCalledWith({
                userId: "user123",
                title: "New project",
                type: ProjectType.TEAM,
                documentation: "docs",
                githubRepo: "repo",
                dueDate: expect.any(Date),
                status: ProjectStatus.ACTIVE,
                members: ["bob"],
            });
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                message: "Created list successfully",
                data: created,
            });
        });
    });

    describe("getProjectsController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = { user: undefined } as unknown as Request;
            const res = mockRes();

            await getProjectsController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("returns 200 with the user's projects", async () => {
            const req = authedReq();
            const res = mockRes();
            const projects = [{ id: "p1" }];
            (projectService.getProjectsService as any).mockResolvedValue(
                projects
            );

            await getProjectsController(req, res);

            expect(projectService.getProjectsService).toHaveBeenCalledWith({
                userId: "user123",
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Fetched lists successfully",
                data: projects,
            });
        });
    });

    describe("getProjectByIdController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = { user: undefined, query: {} } as unknown as Request;
            const res = mockRes();

            await getProjectByIdController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("returns 400 when projectId is missing", async () => {
            const req = authedReq({ query: {} });
            const res = mockRes();

            await getProjectByIdController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(projectService.getProjectByIdService).not.toHaveBeenCalled();
        });

        it("returns 400 when projectId is an array", async () => {
            const req = authedReq({ query: { projectId: ["p1", "p2"] } });
            const res = mockRes();

            await getProjectByIdController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 200 with the requested project", async () => {
            const req = authedReq({ query: { projectId: "p1" } });
            const res = mockRes();
            const project = { id: "p1" };
            (projectService.getProjectByIdService as any).mockResolvedValue(
                project
            );

            await getProjectByIdController(req, res);

            expect(projectService.getProjectByIdService).toHaveBeenCalledWith({
                userId: "user123",
                projectId: "p1",
            });
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe("getProjectSearchController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = { user: undefined, query: {} } as unknown as Request;
            const res = mockRes();

            await getProjectSearchController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("throws BadRequestError for an invalid type filter", async () => {
            const req = authedReq({ query: { type: "not-a-real-type" } });
            const res = mockRes();

            await expect(getProjectSearchController(req, res)).rejects.toThrow(
                "Invalid type filter"
            );
        });

        it("throws BadRequestError for an invalid status filter", async () => {
            const req = authedReq({ query: { status: "not-a-real-status" } });
            const res = mockRes();

            await expect(getProjectSearchController(req, res)).rejects.toThrow(
                "Invalid status filter"
            );
        });

        it("throws BadRequestError for a non-string title", async () => {
            const req = authedReq({ query: { title: ["a", "b"] } });
            const res = mockRes();

            await expect(getProjectSearchController(req, res)).rejects.toThrow(
                "Invalid title filter"
            );
        });

        it("throws BadRequestError for an unparsable dueDate filter", async () => {
            const req = authedReq({ query: { dueDate: "not-a-date" } });
            const res = mockRes();

            await expect(getProjectSearchController(req, res)).rejects.toThrow(
                "Invalid dueDate filter"
            );
        });

        it("throws BadRequestError when dueDate is repeated (parsed as an array)", async () => {
            // Express parses `?dueDate=a&dueDate=b` as a string[], which
            // must be rejected before any Date parsing is attempted.
            const req = authedReq({
                query: { dueDate: ["2026-06-01", "2026-06-02"] },
            });
            const res = mockRes();

            await expect(getProjectSearchController(req, res)).rejects.toThrow(
                "Invalid dueDate filter"
            );
        });

        it("forwards valid, parsed filters to the service", async () => {
            const req = authedReq({
                query: {
                    title: "Roadmap",
                    type: ProjectType.TEAM,
                    status: ProjectStatus.ACTIVE,
                    dueDate: "2026-06-01",
                },
            });
            const res = mockRes();
            (projectService.getProjectSearchService as any).mockResolvedValue(
                []
            );

            await getProjectSearchController(req, res);

            expect(projectService.getProjectSearchService).toHaveBeenCalledWith(
                {
                    userId: "user123",
                    title: "Roadmap",
                    type: ProjectType.TEAM,
                    status: ProjectStatus.ACTIVE,
                    dueDate: expect.any(Date),
                }
            );
        });

        it("succeeds with no filters at all", async () => {
            const req = authedReq({ query: {} });
            const res = mockRes();
            (projectService.getProjectSearchService as any).mockResolvedValue(
                []
            );

            await getProjectSearchController(req, res);

            expect(projectService.getProjectSearchService).toHaveBeenCalledWith(
                {
                    userId: "user123",
                    title: undefined,
                    type: undefined,
                    status: undefined,
                    dueDate: undefined,
                }
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe("updateProjectController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = {
                user: undefined,
                query: {},
                body: {},
            } as unknown as Request;
            const res = mockRes();

            await updateProjectController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("returns 400 when projectId is missing", async () => {
            const req = authedReq({ query: {}, body: { title: "New" } });
            const res = mockRes();

            await updateProjectController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(projectService.updateProjectService).not.toHaveBeenCalled();
        });

        it("forwards projectId, userId, and body fields; returns 200", async () => {
            const req = authedReq({
                query: { projectId: "p1" },
                body: { title: "Updated title" },
            });
            const res = mockRes();
            const updated = { id: "p1", title: "Updated title" };
            (projectService.updateProjectService as any).mockResolvedValue(
                updated
            );

            await updateProjectController(req, res);

            expect(projectService.updateProjectService).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: "user123",
                    projectId: "p1",
                    title: "Updated title",
                })
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Updated list successfully",
                data: updated,
            });
        });
    });

    describe("deleteProjectController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = {
                user: undefined,
                query: {},
            } as unknown as Request;
            const res = mockRes();

            await deleteProjectController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("returns 400 when projectId is missing", async () => {
            const req = authedReq({ query: {} });
            const res = mockRes();

            await deleteProjectController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("deletes the project and returns 200 with no data field", async () => {
            const req = authedReq({ query: { projectId: "p1" } });
            const res = mockRes();

            await deleteProjectController(req, res);

            expect(projectService.deleteProjectService).toHaveBeenCalledWith({
                userId: "user123",
                projectId: "p1",
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Deleted project successfully",
            });
        });
    });

    describe("getSharedProjectController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = { user: undefined } as unknown as Request;
            const res = mockRes();

            await getSharedProjectController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("returns a 'no shared projects' message when the list is empty", async () => {
            const req = authedReq();
            const res = mockRes();
            (projectService.getSharedProjectsService as any).mockResolvedValue(
                []
            );

            await getSharedProjectController(req, res);

            expect(res.json).toHaveBeenCalledWith({
                message: "No shared projects",
                data: [],
            });
        });

        it("returns a success message when shared projects exist", async () => {
            const req = authedReq();
            const res = mockRes();
            const shared = [{ id: "p1" }];
            (projectService.getSharedProjectsService as any).mockResolvedValue(
                shared
            );

            await getSharedProjectController(req, res);

            expect(res.json).toHaveBeenCalledWith({
                message: "Shared projects fetched successfully",
                data: shared,
            });
        });
    });

    describe("leaveProjectController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = {
                user: undefined,
                query: {},
            } as unknown as Request;
            const res = mockRes();

            await leaveProjectController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("returns 400 when projectId is missing", async () => {
            const req = authedReq({ query: {} });
            const res = mockRes();

            await leaveProjectController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("leaves the project and returns 200 with no data field", async () => {
            const req = authedReq({ query: { projectId: "p1" } });
            const res = mockRes();

            await leaveProjectController(req, res);

            expect(projectService.leaveProjectService).toHaveBeenCalledWith({
                userId: "user123",
                projectId: "p1",
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Left project successfully",
            });
        });
    });
});
