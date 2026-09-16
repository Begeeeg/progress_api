import dotenv from "dotenv";
dotenv.config({ quiet: true });

import mongoose from "mongoose";

// Fixed delay between failed initial connection attempts to avoid
// repeatedly hitting MongoDB while the database or network is unavailable.
const RETRY_INTERVAL = 5000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Establishes the application's MongoDB connection.
 *
 * The initial connection is retried indefinitely at a fixed interval so
 * temporary database or network unavailability does not prevent the
 * application from eventually connecting.
 */
const connectDB = async (): Promise<void> => {
    const mongoURI = process.env.MONGO_URI;

    if (!mongoURI) {
        // Fail immediately when the required database configuration is missing;
        // retrying cannot resolve a configuration error.
        throw new Error("MONGO_URI is not properly defined");
    }

    while (true) {
        try {
            await mongoose.connect(mongoURI);

            console.log("🛫 MongoDB connected");
            return;
        } catch (error) {
            // Retry transient connection failures instead of terminating
            // the application during startup.
            console.error("💥 MongoDB initial connection failed:", error);
            console.log(`🔄 Retrying in ${RETRY_INTERVAL / 1000} seconds...`);

            await sleep(RETRY_INTERVAL);
        }
    }
};

// These listeners report connection-state changes that can occur after
// the initial connection has already been established.
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
