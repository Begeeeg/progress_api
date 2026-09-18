import { z } from "zod";
import { TaskStatus } from "../types/task.enum";

export const createTaskSchema = z.object({
    title: z.string().trim().min(1, "Title is required"),
    notes: z.string().trim().optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    deadline: z.coerce.date().refine(
        (date) => {
            const today = new Date();

            today.setHours(0, 0, 0, 0);

            const dueDate = new Date(date);
            dueDate.setHours(0, 0, 0, 0);

            return dueDate >= today;
        },
        {
            message: "Due date cannot be in the past",
        }
    ),
    assignedTo: z.array(z.string()).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
