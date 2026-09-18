import { Request, Response } from "express";
import * as taskService from "./task.service";

export const createTaskController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const { projectId } = req.query;

    // Express query parameters are not guaranteed to be strings, so validate
    // the value before passing it to the service layer.
    if (typeof projectId !== "string") {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }

    const task = await taskService.createTaskService({
        userId: req.user._id.toString(),
        projectId,
        title: req.body.title,
        notes: req.body.notes,
        status: req.body.status,
        deadline: req.body.deadline,
        assignedTo: req.body.assignedTo,
    });

    res.status(201).json({
        message: "Created task successfully",
        data: task,
    });
};
