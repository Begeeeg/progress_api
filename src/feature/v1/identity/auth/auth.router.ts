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

const router = express.Router();

router.post("/register", validate(RegisterUserSchema), registerController);
router.get("/verify-email", verifyEmailController);
router.post("/resend-verification", requireAuth, resendVerificationController);
router.post("/logout", requireAuth, logOutController);
router.post("/login", validate(LoginUserSchema), logInController);

export default router;
