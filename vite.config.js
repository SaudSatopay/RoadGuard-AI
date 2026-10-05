import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import compression from "compression";
import { heroPoster } from "./tools/hero-poster.js";
import { inlineCss } from "./tools/inline-css.js";
import { siteUrl } from "./tools/site-url.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// `vite preview` serves files uncompressed; a real host gzips them. Compress the preview so local Lighthouse
// numbers reflect what visitors would actually download.
const previewCompression = {
  name: "roadguard-preview-compression",
  configurePreviewServer(server) {
    server.middlewares.use(compression());
  },
};


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
  plugins: [react(), tailwindcss(), heroPoster(), inlineCss(), siteUrl(), previewCompression],
  resolve: {
    alias: {
      "@": path.join(here, "src"),
      "@shared": path.join(here, "shared"),
    },
  },
  // Pre-bundle the lazily imported libraries so a first visit to the console never re-optimises React mid-session.
  optimizeDeps: {
    include: ["react", "react-dom", "lucide-react", "leaflet", "react-leaflet"],
  },
  server: { host: true, port: 5173, https, proxy },
  preview: { host: true, port: 4173, https, proxy },
  build: {
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{js,jsx}", "shared/**/*.test.{js,jsx}"],
    setupFiles: ["./vitest.setup.js"],
  },
});
