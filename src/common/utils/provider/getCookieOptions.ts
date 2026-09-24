import dotenv from "dotenv";
dotenv.config({ quiet: true });

export const getCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 10 * 60 * 1000,
    path: "/",
});
