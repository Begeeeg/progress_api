import rateLimit from "express-rate-limit";

const isTest = process.env.NODE_ENV === "test";

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many attempts, please try again later",
    },
});

//test
