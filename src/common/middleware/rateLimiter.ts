import rateLimit from "express-rate-limit";

/**
 * Limits repeated authentication requests to reduce brute-force and
 * automated abuse against authentication endpoints.
 */
export const authLimiter = rateLimit({
    // Allow at most 10 requests from the same client within 15 minutes.
    windowMs: 15 * 60 * 1000,
    max: 10,

    // Return rate-limit information through standardized RateLimit headers.
    standardHeaders: true,

    // Disable the older X-RateLimit-* header format.
    legacyHeaders: false,

    // Use a generic response so clients receive actionable feedback
    // without exposing details about the rate-limiting implementation.
    message: { message: "Too many attempts, please try again later" },
});
