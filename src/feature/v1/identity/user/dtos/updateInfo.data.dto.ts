import { z } from "zod";

export const UpdateUserInfoSchema = z.object({
    username: z
        .string()
        .trim()
        .min(3, "Username must be at least 3 characters")
        .max(15, "Username must be at most 15 characters")
        .optional(),

    givenname: z
        .string()
        .trim()
        .min(3, "Givenname must be at least 3 characters")
        .max(15, "Givenname must be at most 15 characters")
        .transform((value) => {
            return value.charAt(0).toUpperCase() + value.slice(1);
        })
        .optional(),

    surname: z
        .string()
        .trim()
        .min(3, "Surname must be at least 3 characters")
        .max(15, "Surname must be at most 15 characters")
        .transform((value) => {
            return value.charAt(0).toUpperCase() + value.slice(1);
        })
        .optional(),

    password: z.string(),
});

export type UpdateUserInfo = z.infer<typeof UpdateUserInfoSchema>;
