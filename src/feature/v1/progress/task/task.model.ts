import { Schema, model, Document } from "mongoose";
import { ITask } from "./types/task.interfaces";
import { TaskStatus } from "./types/task.enum";

export type TaskDocument = ITask & Document;

const TaskSchema = new Schema<TaskDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        projectId: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        notes: {
            type: String,
            trim: true,
        },
        status: {
            type: String,
            enum: Object.values(TaskStatus),
            default: TaskStatus.PENDING,
        },
        deadline: {
            type: Date,
            required: true,
        },
        assignedTo: [
            {
                type: Schema.Types.ObjectId,
                ref: "User",
            },
        ],
    },
    {
        timestamps: true,
    }
);

const TaskModel = model<TaskDocument>("Task", TaskSchema);

export default TaskModel;
