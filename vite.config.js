import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { heroPoster } from "./tools/hero-poster.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// Optional HTTPS for testing the camera/GPS from a phone on the LAN (mkcert certs in certs/).
const certFile = path.join(here, "certs", "cert.pem");
const keyFile = path.join(here, "certs", "key.pem");
const https = fs.existsSync(certFile) && fs.existsSync(keyFile)
  ? { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }
  : undefined;

// Everything under /api goes to the FastAPI backend, so the browser never needs CORS or certificates for it.
const apiTarget = process.env.ROADGUARD_API || "http://127.0.0.1:8000";
const proxy = {
  "/api": { target: apiTarget, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), heroPoster()],
  resolve: {
    alias: {
      "@": path.join(here, "src"),
      "@shared": path.join(here, "shared"),
    },
  },
  // Pre-bundle the lazily imported libraries so a first visit to the console never re-optimises React mid-session.
  optimizeDeps: {
    include: ["react", "react-dom", "framer-motion", "lucide-react", "leaflet", "react-leaflet", "@paper-design/shaders-react"],
  },
  server: { host: true, port: 5173, https, proxy },
  preview: { host: true, port: 4173, https, proxy },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/leaflet") || id.includes("react-leaflet")) return "map";
          if (id.includes("@paper-design")) return "shaders";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{js,jsx}", "shared/**/*.test.{js,jsx}"],
  },
});
