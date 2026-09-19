import { Request, Response } from "express";
import * as taskService from "./task.service";

export const createTaskController = async (
    req: Request,
    res: Response,
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

export const getTasksController = async (
    req: Request,
    res: Response,
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

    const tasks = await taskService.getTasksService({
        userId: req.user._id.toString(),
        projectId,
    });

    res.status(200).json({
        message: "Fetched tasks successfully",
        data: tasks,
    });
};

export const getTaskByIdController = async (
    req: Request,
    res: Response,
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const { projectId, taskId } = req.query;

    if (typeof projectId !== "string") {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }

    if (typeof taskId !== "string") {
        res.status(400).json({ message: "Invalid task id" });
        return;
    }

    const tasks = await taskService.getTaskByIdService({
        userId: req.user._id.toString(),
        projectId,
        taskId,
    });

    res.status(200).json({
        message: "Fetched tasks successfully",
        data: tasks,
    });
};

export const updateTaskController = async (
    req: Request,
    res: Response,
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const { projectId, taskId } = req.query;

    if (typeof projectId !== "string") {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }

    if (typeof taskId !== "string") {
        res.status(400).json({ message: "Invalid task id" });
        return;
    }

    const task = await taskService.updateTaskService({
        userId: req.user._id.toString(),
        projectId,
        taskId,
        title: req.body.title,
        notes: req.body.notes,
        assignedTo: req.body.assignedTo,
        status: req.body.status,
        deadline: req.body.deadline,
    });

    res.status(200).json({
        message: "Updated task successfully",
        data: task,
    });
};

export const deleteTaskController = async (
    req: Request,
    res: Response,
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const { projectId, taskId } = req.query;

    if (typeof projectId !== "string") {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }

    if (typeof taskId !== "string") {
        res.status(400).json({ message: "Invalid task id" });
        return;
    }

    await taskService.deleteTaskService({
        userId: req.user._id.toString(),
        projectId,
        taskId,
    });

    res.status(200).json({
        message: "Deleted task successfully",
    });
};
