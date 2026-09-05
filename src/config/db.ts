import dotenv from "dotenv";
dotenv.config({ quiet: true });

import mongoose from "mongoose";

const RETRY_INTERVAL = 5000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const connectDB = async (): Promise<void> => {
    const mongoURI = process.env.MONGO_URI;

    if (!mongoURI) {
        throw new Error("MONGO_URI is not properly defined");
    }

    while (true) {
        try {
            await mongoose.connect(mongoURI);

            console.log("🛫 MongoDB connected");
            return;
        } catch (error) {
            console.error("💥 MongoDB initial connection failed:", error);
            console.log(`🔄 Retrying in ${RETRY_INTERVAL / 1000} seconds...`);

            await sleep(RETRY_INTERVAL);
        }
    }
};

mongoose.connection.on("error", (error) => {
    console.error("💥 MongoDB error:", error);
});

mongoose.connection.on("disconnected", () => {
    console.warn("🔻 MongoDB disconnected");
});

mongoose.connection.on("reconnected", () => {
    console.log("🛫 MongoDB reconnected");
});

export default connectDB;
