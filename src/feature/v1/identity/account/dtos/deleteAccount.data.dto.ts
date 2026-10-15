import { z } from "zod";

export const DeleteAccountSchema = z.object({
    password: z.string().min(1, "Password is required to disconnect an account"),
});

export type DeleteAccountInput = z.infer<typeof DeleteAccountSchema>;
