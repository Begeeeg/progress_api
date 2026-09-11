import express from "express";
import { getUserController } from "./user.controller";
import { requireAuth } from "../../../../common/middleware/requireAuth";

const router = express.Router();

router.get("/me", requireAuth, getUserController);

export default router;
