import { defineConfig } from "vitest/config";

// The Python package serves the built editor from nf_schema_builder/static.
// For GUI development, run the backend on a fixed port and start Vite:
//   uv run nfsb edit tests/test-schema-full.json --port 5173 --no-browser
//   npm run dev --prefix gui
const backend = process.env.NFSB_BACKEND ?? "http://127.0.0.1:5173";

export default defineConfig({
  base: "./",
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: backend,
        changeOrigin: true,
        // The backend refuses cross-origin writes, and the proxy does not make the
        // browser's Origin match the Host it forwards. In development, drop it.
        configure: (proxy) => proxy.on("proxyReq", (request) => request.removeHeader("origin")),
      },
    },
  },
  build: {
    outDir: "../nf_schema_builder/static",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
