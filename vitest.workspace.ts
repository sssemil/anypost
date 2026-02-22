import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/anypost-core",
  "apps/anypost-web",
  "apps/anypost-relay",
]);
