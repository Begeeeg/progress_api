import { Request, Response } from "express";
import * as projectService from "./project.service";

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
        role: req.body.role,
    });

    res.status(201).json({
        message: "Created list successfully",
        data: project,
    });
};
