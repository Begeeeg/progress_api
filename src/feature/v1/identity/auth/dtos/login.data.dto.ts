import { z } from "zod";

export const LoginUserSchema = z.object({
    email: z.string().trim().email("Invalid email address"),

    password: z.string().trim().min(8, "Password incorrect"),
});

export type LoginUserInput = z.infer<typeof LoginUserSchema>;
