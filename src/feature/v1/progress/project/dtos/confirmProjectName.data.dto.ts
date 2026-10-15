import { z } from "zod";

export const ConfirmProjectNameSchema = z.preprocess(
    (value) => value ?? {},
    z.object({
        projectName: z.preprocess(
            (value) => value ?? "",
            z.string().trim().min(1, "Project name is required"),
        ),
    }),
);

export type ConfirmProjectNameInput = z.infer<
    typeof ConfirmProjectNameSchema
>;
