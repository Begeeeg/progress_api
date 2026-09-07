import express from "express";
import {
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

export default router;
