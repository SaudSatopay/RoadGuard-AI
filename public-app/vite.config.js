import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = path.resolve(here, "..", "shared");

// Optional HTTPS so phones on the LAN get camera and GPS access (mkcert certs in ../certs).
const certFile = path.resolve(here, "..", "certs", "cert.pem");
const keyFile = path.resolve(here, "..", "certs", "key.pem");
const https = fs.existsSync(certFile) && fs.existsSync(keyFile)
  ? { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }
  : undefined;

const apiTarget = process.env.ROADGUARD_API || "http://127.0.0.1:8000";
const proxy = {
  "/api": { target: apiTarget, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@shared": shared },
    // Shared components import React and friends; resolve them from this app so there is one copy.
    dedupe: ["react", "react-dom", "lucide-react", "leaflet", "react-leaflet"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "lucide-react", "leaflet", "react-leaflet"],
  },
  server: { host: true, port: 5175, https, proxy, fs: { allow: [here, shared] } },
  preview: { host: true, port: 4175, https, proxy },
  build: {
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{js,jsx}"],
    setupFiles: ["./vitest.setup.js"],
    server: { deps: { inline: [/shared/] } },
  },
});
