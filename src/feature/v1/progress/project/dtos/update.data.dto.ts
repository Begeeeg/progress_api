import { z } from "zod";
import { ProjectStatus, ProjectType } from "../types/project.enum";

export const UpdateProjectSchema = z.object({
    title: z
        .string()
        .trim()
        .min(1, "Title is required")
        .max(15, "Title must be less than 15 characters")
        .optional(),

    type: z.nativeEnum(ProjectType).optional(),

    documentation: z.string().trim().optional(),
    githubRepo: z.string().trim().optional(),

    dueDate: z.coerce
        .date()
        .refine(
            (date) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const dueDate = new Date(date);
                dueDate.setHours(0, 0, 0, 0);
                return dueDate >= today;
            },
            { message: "Due date cannot be in the past" }
        )
        .optional(),

    status: z.nativeEnum(ProjectStatus).optional(),

    members: z.array(z.string()).optional(),
});
