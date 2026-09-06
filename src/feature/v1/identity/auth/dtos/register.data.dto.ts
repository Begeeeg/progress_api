import { z } from "zod";

export const RegisterUserSchema = z
    .object({
        username: z
            .string()
            .trim()
            .min(1, "Username must be at least 1 characters")
            .max(15, "Username must be at most 15 characters"),

        givenname: z
            .string()
            .trim()
            .min(1, "Givenname must be at least 1 characters")
            .max(15, "Givenname must be at most 15 characters")
            .transform((value) => {
                return value.charAt(0).toUpperCase() + value.slice(1);
            }),

        surname: z
            .string()
            .trim()
            .min(1, "Surname must be at least 1 characters")
            .max(15, "Surname must be at most 15 characters")
            .transform((value) => {
                return value.charAt(0).toUpperCase() + value.slice(1);
            }),

        email: z
            .string()
            .trim()
            .email("Invalid email address")
            .lowercase()
            .refine(
                (email) => {
                    const domain = email.split("@")[1]?.toLowerCase();

                    return ["gmail.com", "yahoo.com", "outlook.com"].includes(
                        domain
                    );
                },
                {
                    message: "Only Gmail, Yahoo, and Outlook are allowed",
                }
            ),

        password: z
            .string()
            .trim()
            .min(8, "Password must be at least 8 characters")
            .regex(
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
                "Password must contain at least one uppercase letter, one lowercase letter, and one number"
            ),

        confirmPassword: z.string().trim(),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

export type RegisterUserInput = z.infer<typeof RegisterUserSchema>;
