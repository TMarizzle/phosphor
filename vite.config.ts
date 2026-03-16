import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
    base: command === "build" ? "/phosphor/" : "/",
    plugins: [react()],
    build: {
        outDir: "build",
    },
    server: {
        port: 3000,
    }
}));
