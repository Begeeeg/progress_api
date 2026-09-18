import { Types } from "mongoose";
import {
    BadRequestError,
    NotFoundError,
} from "../../../../common/error/errorStatusCode";
import UserModel from "../../identity/user/user.model";
import { getProjectByIdService } from "../project/project.service";
import { CreateTaskData } from "./types/task.types";
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
            "Task deadline cannot be later than the list's due date"
        );
    }

    let assignedIds: Types.ObjectId[] = [];

    if (assignedTo?.length) {
        const uniqueAssignees = [...new Set(assignedTo.map((id) => id.trim()))];

        const invalidIds = uniqueAssignees.filter(
            (id) => !Types.ObjectId.isValid(id)
        );

        if (invalidIds.length) {
            throw new BadRequestError(
                `Invalid user id(s): ${invalidIds.join(", ")}`
            );
        }

        const assigneeUsers = await UserModel.find({
            _id: { $in: uniqueAssignees },
        }).select("_id username");

        if (assigneeUsers.length !== uniqueAssignees.length) {
            const foundIds = assigneeUsers.map((assignee) =>
                assignee._id.toString()
            );

            const missingIds = uniqueAssignees.filter(
                (id) => !foundIds.includes(id)
            );

            throw new NotFoundError(
                `User(s) not found: ${missingIds.join(", ")}`
            );
        }

        const projectMemberIds = new Set([
            project.userId.toString(),
            ...(project.members ?? []).map((member) => member._id.toString()),
        ]);

        const invalidAssignees = assigneeUsers.filter(
            (assignee) => !projectMemberIds.has(assignee._id.toString())
        );

        if (invalidAssignees.length) {
            const invalidUsernames = invalidAssignees.map(
                (assignee) => assignee.username
            );

            throw new BadRequestError(
                `User(s) are not members of this project: ${invalidUsernames.join(
                    ", "
                )}`
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
    };
};
