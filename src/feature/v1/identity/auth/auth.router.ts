import express from "express";
import {
    logInController,
    logOutController,
    registerController,
    resendVerificationController,
    verifyEmailController,
} from "./auth.controller";
import { validate } from "../../../../common/middleware/validatorDataDto";
import { RegisterUserSchema } from "./dtos/register.data.dto";
import { requireAuth } from "../../../../common/middleware/requireAuth";
import { LoginUserSchema } from "./dtos/login.data.dto";
import { authLimiter } from "../../../../common/middleware/rateLimiter";

const router = express.Router();

router.post(
    "/register",
    authLimiter,
    validate(RegisterUserSchema),
    registerController
);
router.get("/verify-email", verifyEmailController);
router.post(
    "/resend-verification",
    authLimiter,
    requireAuth,
    resendVerificationController
);
router.post("/logout", requireAuth, logOutController);
router.post("/login", authLimiter, validate(LoginUserSchema), logInController);

export default router;
