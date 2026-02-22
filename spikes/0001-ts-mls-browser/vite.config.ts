import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          "ts-mls": ["ts-mls"],
        },
      },
    },
  },
});
