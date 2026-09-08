import dotenv from "dotenv";
dotenv.config({ quiet: true });

import cron from "node-cron";
import app from "./app";
import connectDB from "./config/db";
import { cleanupUnverifiedUsers } from "./common/utils/cleanupUnverifiedUsers";

const PORT = process.env.PORT || 5000;

const start = async () => {
    try {
        await connectDB();
        app.listen(PORT, () => {
            console.log(`🛫 Server is running on http://localhost:${PORT}`);
        });

        cron.schedule("0 0 * * 0", cleanupUnverifiedUsers, {
            timezone: "Asia/Manila",
        });
        console.log(
            "🧹 Unverified user cleanup job scheduled (weekly, Sunday midnight)"
        );
    } catch (error) {
        console.error("💥 Failed to start server:", error);
        process.exit(1);
    }
};

start();
