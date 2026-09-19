import { Types } from "mongoose";
import {
    BadRequestError,
    NotFoundError,
} from "../../../../common/error/errorStatusCode";
import UserModel from "../../identity/user/user.model";
import { getProjectByIdService } from "../project/project.service";
import {
    CreateTaskData,
    GetTaskByIdData,
    UpdateTaskData,
    GetTasksData,
} from "./types/task.types";
import TaskModel from "./task.model";

export const createTaskService = async ({
    userId,
    projectId,
    title,
    notes,
    status,
    deadline,
    assignedTo,
}: CreateTaskData) => {
    const user = await UserModel.findById(userId);
    if (!user) {
        throw new NotFoundError("User not found");
    }

    const project = await getProjectByIdService({ userId, projectId });

    const parsedDeadline = new Date(deadline);

    if (isNaN(parsedDeadline.getTime())) {
        throw new BadRequestError("Invalid due date");
    }

    if (parsedDeadline.getTime() > project.dueDate.getTime()) {
        throw new BadRequestError(
            "Task deadline cannot be later than the list's due date",
        );
    }

    const remainingDays = Math.ceil(
        (parsedDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    let assignedIds: Types.ObjectId[] = [];

    if (assignedTo?.length) {
        const uniqueAssignees = [
            ...new Set(assignedTo.map((username) => username.trim())),
        ];

        const assigneeUsers = await UserModel.find({
            username: { $in: uniqueAssignees },
        }).select("_id username");

        if (assigneeUsers.length !== uniqueAssignees.length) {
            const foundUsernames = assigneeUsers.map(
                (assignee) => assignee.username,
            );

            const missingUsernames = uniqueAssignees.filter(
                (username) => !foundUsernames.includes(username),
            );

            throw new NotFoundError(
                `User(s) not found: ${missingUsernames.join(", ")}`,
            );
        }

        const projectMemberIds = new Set([
            project.userId.toString(),
            ...(project.members ?? []).map((member) => member._id.toString()),
        ]);

        const invalidAssignees = assigneeUsers.filter(
            (assignee) => !projectMemberIds.has(assignee._id.toString()),
        );

        if (invalidAssignees.length) {
            const invalidUsernames = invalidAssignees.map(
                (assignee) => assignee.username,
            );

            throw new BadRequestError(
                `User(s) are not members of this project: ${invalidUsernames.join(
                    ", ",
                )}`,
            );
        }

        assignedIds = assigneeUsers.map((assignee) => assignee._id);
    }

    const task = await TaskModel.create({
        userId: user._id,
        projectId: project.id,
        title,
        notes,
        status,
        deadline: parsedDeadline,
        assignedTo: assignedIds,
    });

    return {
        id: task._id,
        projectId: task.projectId,
        title: task.title,
        notes: task.notes,
        status: task.status,
        deadline: task.deadline,
        assignedTo: task.assignedTo,
        remainingDays,
    };
};

export const getTasksService = async ({ userId, projectId }: GetTasksData) => {
    const user = await UserModel.findById(userId);
    if (!user) {
        throw new NotFoundError("User not found");
    }

    const project = await getProjectByIdService({ userId, projectId });

    const tasks = await TaskModel.find({ projectId: project.id }).sort({
        createdAt: -1,
    });

    return tasks.map((task) => {
        const remainingDays = Math.ceil(
            (task.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );

        return {
            id: task._id,
            projectId: task.projectId,
            title: task.title,
            notes: task.notes,
            status: task.status,
            deadline: task.deadline,
            assignedTo: task.assignedTo,
            remainingDays,
        };
    });
};

export const getTaskByIdService = async ({
    userId,
    projectId,
    taskId,
}: GetTaskByIdData) => {
    const user = await UserModel.findById(userId);
    if (!user) {
        throw new NotFoundError("User not found");
    }

    const task = await TaskModel.findById(taskId);
    if (!task) {
        throw new NotFoundError("Task not found");
    }

    await getProjectByIdService({ userId, projectId });

    const remainingDays = Math.ceil(
        (task.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    return {
        id: task._id,
        projectId: task.projectId,
        title: task.title,
        notes: task.notes,
        status: task.status,
        deadline: task.deadline,
        assignedTo: task.assignedTo,
        remainingDays,
    };
};

export const updateTaskService = async ({
    userId,
    projectId,
    taskId,
    title,
    notes,
    status,
    deadline,
    assignedTo,
}: UpdateTaskData) => {
    const user = await UserModel.findById(userId);
    if (!user) {
        throw new NotFoundError("User not found");
    }

    const task = await TaskModel.findById(taskId);
    if (!task) {
        throw new NotFoundError("Task not found");
    }

    const project = await getProjectByIdService({ userId, projectId });

    if (task.projectId.toString() !== project.id.toString()) {
        throw new NotFoundError("Task not found");
    }

    const updateFields: Record<string, unknown> = {};

    if (title !== undefined) {
        updateFields.title = title;
    }

    if (notes !== undefined) {
        updateFields.notes = notes;
    }

    if (status !== undefined) {
        updateFields.status = status;
    }

    if (deadline !== undefined) {
        const parsedDeadline = new Date(deadline);

        if (isNaN(parsedDeadline.getTime())) {
            throw new BadRequestError("Invalid due date");
        }

        if (parsedDeadline.getTime() > project.dueDate.getTime()) {
            throw new BadRequestError(
                "Task deadline cannot be later than the list's due date",
            );
        }

        updateFields.deadline = parsedDeadline;
    }

    if (assignedTo !== undefined) {
        let assignedIds: Types.ObjectId[] = [];

        if (assignedTo.length) {
            const uniqueAssignees = [
                ...new Set(assignedTo.map((username) => username.trim())),
            ];

            const assigneeUsers = await UserModel.find({
                username: { $in: uniqueAssignees },
            }).select("_id username");

            if (assigneeUsers.length !== uniqueAssignees.length) {
                const foundUsernames = assigneeUsers.map(
                    (assignee) => assignee.username,
                );

                const missingUsernames = uniqueAssignees.filter(
                    (username) => !foundUsernames.includes(username),
                );

                throw new NotFoundError(
                    `User(s) not found: ${missingUsernames.join(", ")}`,
                );
            }

            const projectMemberIds = new Set([
                project.userId.toString(),
                ...(project.members ?? []).map((member) =>
                    member._id.toString(),
                ),
            ]);

            const invalidAssignees = assigneeUsers.filter(
                (assignee) => !projectMemberIds.has(assignee._id.toString()),
            );

            if (invalidAssignees.length) {
                const invalidUsernames = invalidAssignees.map(
                    (assignee) => assignee.username,
                );

                throw new BadRequestError(
                    `User(s) are not members of this project: ${invalidUsernames.join(
                        ", ",
                    )}`,
                );
            }

            assignedIds = assigneeUsers.map((assignee) => assignee._id);
        }

        updateFields.assignedTo = assignedIds;
    }

    if (Object.keys(updateFields).length === 0) {
        throw new BadRequestError(
            "At least one field must be provided to update",
        );
    }

    const updatedTask = await TaskModel.findByIdAndUpdate(
        taskId,
        updateFields,
        { new: true },
    );

    if (!updatedTask) {
        throw new NotFoundError("Task not found");
    }

    const remainingDays = Math.ceil(
        (updatedTask.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    return {
        id: updatedTask._id,
        projectId: updatedTask.projectId,
        title: updatedTask.title,
        notes: updatedTask.notes,
        status: updatedTask.status,
        deadline: updatedTask.deadline,
        assignedTo: updatedTask.assignedTo,
        remainingDays,
    };
};
