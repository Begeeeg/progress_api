import { z } from "zod";
import { TaskStatus } from "../types/task.enum";

export const updateTaskSchema = z.object({
    title: z.string().trim().min(1, "Title is required").optional(),
    notes: z.string().trim().optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    deadline: z.coerce
        .date()
        .refine(
            (date) => {
                const today = new Date();

                today.setHours(0, 0, 0, 0);

                const dueDate = new Date(date);
                dueDate.setHours(0, 0, 0, 0);

                return dueDate >= today;
            },
            {
                message: "Due date cannot be in the past",
            },
        )
        .optional(),
    assignedTo: z.array(z.string()).optional(),
});

export type UpdateTaskSchema = z.infer<typeof updateTaskSchema>;
