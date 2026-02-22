import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

const base = process.env.GITHUB_ACTIONS ? "/anypost/" : "/";

export default defineConfig({
  base,
  plugins: [solidPlugin()],
  build: {
    target: "esnext",
  },
});
