import { z } from "zod";

export const ConfirmTaskNameSchema = z.preprocess(
    (value) => value ?? {},
    z.object({
        taskName: z.preprocess(
            (value) => value ?? "",
            z.string().trim().min(1, "Task name is required"),
        ),
    }),
);

export type ConfirmTaskNameInput = z.infer<typeof ConfirmTaskNameSchema>;
