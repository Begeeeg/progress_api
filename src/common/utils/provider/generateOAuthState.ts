import crypto from "crypto";

export const generateOAuthState = (): string => {
    return crypto.randomBytes(32).toString("hex");
};
