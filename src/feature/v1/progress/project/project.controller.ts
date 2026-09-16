import { Request, Response } from "express";
import * as projectService from "./project.service";
import { BadRequestError } from "../../../../common/error/errorStatusCode";
import { ProjectStatus, ProjectType } from "./types/project.enum";

export const createProjectController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const project = await projectService.createProjectService({
        userId: req.user._id.toString(),
        title: req.body.title,
        type: req.body.type,
        documentation: req.body.documentation,
        githubRepo: req.body.githubRepo,
        dueDate: req.body.dueDate,
        status: req.body.status,
        members: req.body.members,
    });

    res.status(201).json({
        message: "Created list successfully",
        data: project,
    });
};

export const getProjectsController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const projects = await projectService.getProjectsService({
        userId: req.user._id.toString(),
    });

    res.status(200).json({
        message: "Fetched lists successfully",
        data: projects,
    });
};

export const getProjectByIdController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const { projectId } = req.query;

    if (typeof projectId !== "string") {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }

    const project = await projectService.getProjectByIdService({
        userId: req.user._id.toString(),
        projectId,
    });

    res.status(200).json({
        message: "Fetched list successfully",
        data: project,
    });
};

export const getProjectSearchController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const { title, type, status, dueDate } = req.query;

    if (title !== undefined && typeof title !== "string") {
        throw new BadRequestError("Invalid title filter");
    }

    if (
        type !== undefined &&
        (typeof type !== "string" ||
            !Object.values(ProjectType).includes(type as ProjectType))
    ) {
        throw new BadRequestError(
            `Invalid type filter. Must be one of: ${Object.values(
                ProjectType
            ).join(", ")}`
        );
    }

    if (
        status !== undefined &&
        (typeof status !== "string" ||
            !Object.values(ProjectStatus).includes(status as ProjectStatus))
    ) {
        throw new BadRequestError(
            `Invalid status filter. Must be one of: ${Object.values(
                ProjectStatus
            ).join(", ")}`
        );
    }

    let parsedDueDate: Date | undefined;
    if (dueDate !== undefined) {
        if (typeof dueDate !== "string") {
            throw new BadRequestError("Invalid dueDate filter");
        }
        parsedDueDate = new Date(dueDate);
        if (isNaN(parsedDueDate.getTime())) {
            throw new BadRequestError("Invalid dueDate filter");
        }
    }

    const projects = await projectService.getProjectSearchService({
        userId: req.user._id.toString(),
        title: title as string | undefined,
        type: type as ProjectType | undefined,
        status: status as ProjectStatus | undefined,
        dueDate: parsedDueDate,
    });

    res.status(200).json({
        message: "Fetched lists successfully",
        data: projects,
    });
};

export const updateProjectController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const { projectId } = req.query;

    if (typeof projectId !== "string") {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }

    const project = await projectService.updateProjectService({
        userId: req.user._id.toString(),
        projectId,
        title: req.body.title,
        type: req.body.type,
        documentation: req.body.documentation,
        githubRepo: req.body.githubRepo,
        dueDate: req.body.dueDate,
        status: req.body.status,
        members: req.body.members,
    });

    res.status(200).json({
        message: "Updated list successfully",
        data: project,
    });
};

export const deleteProjectController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const { projectId } = req.query;

    if (typeof projectId !== "string") {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }

    await projectService.deleteProjectService({
        userId: req.user._id.toString(),
        projectId,
    });

    res.status(200).json({
        message: "Deleted project successfully",
    });
};

export const getSharedProjectController = async (
    req: Request,
    res: Response
) => {
    if (!req.user) {
        return res.status(401).json({
            message: "Unauthorized",
        });
    }

    const projects = await projectService.getSharedProjectsService({
        userId: req.user._id.toString(),
    });

    res.status(200).json({
        message:
            projects.length === 0
                ? "No shared projects"
                : "Shared projects fetched successfully",
        data: projects,
    });
};

export const leaveProjectController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const { projectId } = req.query;

    if (typeof projectId !== "string") {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }

    await projectService.leaveProjectService({
        userId: req.user._id.toString(),
        projectId,
    });

    res.status(200).json({
        message: "Left project successfully",
    });
};
