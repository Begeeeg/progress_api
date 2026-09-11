import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        globals: false, // set true only if you added "vitest/globals" to tsconfig types
        testTimeout: 20000,
        hookTimeout: 60000, // MongoMemoryReplSet init (binary download + replica election) is slower than a standalone mongod
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            exclude: ["**/*.test.ts", "**/dist/**", "**/node_modules/**"],
        },
    },
});