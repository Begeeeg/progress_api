import { Schema, model, Document } from "mongoose";
import { IProject } from "./types/project.interfaces";
import { ProjectRole, ProjectStatus, ProjectType } from "./types/project.enum";

export type ProjectDocument = IProject & Document;

const ProjectSchema = new Schema<ProjectDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        type: {
            type: String,
            enum: Object.values(ProjectType),
            default: ProjectType.PERSONAL,
        },
        documentation: {
            type: String,
            required: true,
            trim: true,
        },
        githubRepo: {
            type: String,
            required: true,
            trim: true,
        },
        dueDate: {
            type: Date,
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(ProjectStatus),
            default: ProjectStatus.ACTIVE,
        },
        workload: {
            type: Number,
            required: true,
        },
        members: [
            {
                type: Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        role: {
            type: String,
            enum: Object.values(ProjectRole),
            default: ProjectRole.OWNER,
        },
    },
    {
        timestamps: true,
    }
);

const ProjectModel = model<ProjectDocument>("Project", ProjectSchema);

export default ProjectModel;
