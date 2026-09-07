import express from "express";
import {
    logOutController,
    registerController,
    resendVerificationController,
    verifyEmailController,
} from "./auth.controller";
import { validate } from "../../../../common/middleware/validatorDataDto";
import { RegisterUserSchema } from "./dtos/register.data.dto";
import { requireAuth } from "../../../../common/middleware/requireAuth";

const router = express.Router();

router.post("/register", validate(RegisterUserSchema), registerController);
router.get("/verify-email", verifyEmailController);
router.post("/resend-verification", requireAuth, resendVerificationController);
router.post("/logout", requireAuth, logOutController);

export default router;
