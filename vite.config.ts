import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { proxy: { "/api": "http://127.0.0.1:3001", "/catalog.json": "http://127.0.0.1:3001", "/uploads": "http://127.0.0.1:3001" } },
});
