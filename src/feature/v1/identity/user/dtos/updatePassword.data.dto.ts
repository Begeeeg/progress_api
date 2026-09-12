import { z } from "zod";

export const UpdatePasswordSchema = z
    .object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z
            .string()
            .min(8, "Password must be at least 8 characters")
            .regex(
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
                "Password must contain at least one uppercase letter, one lowercase letter, and one number"
            ),
        confirmNewPassword: z.string().min(1, "Current password is required"),
    })
    .refine((data) => data.newPassword === data.confirmNewPassword, {
        message: "Passwords do not match",
        path: ["confirmNewPassword"],
    });

export type UpdatePasswordInput = z.infer<typeof UpdatePasswordSchema>;
