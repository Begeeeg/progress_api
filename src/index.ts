import dotenv from "dotenv";
dotenv.config({ quiet: true });

import app from "./app";

const PORT = process.env.PORT || 5000;

const start = async () => {
    try {
        app.listen(PORT, () => {
            console.log(`🛫 Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("💥 Failed to start server:", error);
        process.exit(1);
    }
};

start();
