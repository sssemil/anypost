import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.anypost.app",
  appName: "Anypost",
  webDir: "../anypost-web/dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
