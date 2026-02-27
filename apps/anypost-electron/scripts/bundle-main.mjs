import { build } from "esbuild";

await build({
  entryPoints: ["dist/main/main.js"],
  outfile: "dist/main/main.js",
  bundle: true,
  platform: "node",
  format: "esm",
  allowOverwrite: true,
  external: ["electron"],
});
