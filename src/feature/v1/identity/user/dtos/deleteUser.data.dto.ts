import { z } from "zod";

export const DeleteUserSchema = z.object({
    password: z.string().min(1, "Password is required to delete your account"),
});

export type DeleteUserInput = z.infer<typeof DeleteUserSchema>;
