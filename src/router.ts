import { Router } from "express";
import { authRouter } from "./feature/v1/identity/auth";
import { userRouter } from "./feature/v1/identity/user";
import { projectRouter } from "./feature/v1/progress/project";
import { taskRouter } from "./feature/v1/progress/task";

const router = Router();

router.use("/identity/auth", authRouter);
router.use("/identity/user", userRouter);
router.use("/progress/project", projectRouter);
router.use("/progress/task", taskRouter);

export default router;
