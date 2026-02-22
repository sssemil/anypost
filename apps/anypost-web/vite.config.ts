import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import solidPlugin from "vite-plugin-solid";

const base = "/";

export default defineConfig({
  base,
  plugins: [tailwindcss(), solidPlugin()],
  build: {
    target: "esnext",
  },
});
