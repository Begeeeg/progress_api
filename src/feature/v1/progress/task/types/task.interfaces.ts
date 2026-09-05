import { Types } from "mongoose";
import { TaskStatus } from "./task.enum";

export interface ITask {
    userId: Types.ObjectId;
    projectId: Types.ObjectId;
    title: string;
    notes?: string;
    status: TaskStatus;
    deadline: Date;
    assignedTo?: Types.ObjectId[];
}
