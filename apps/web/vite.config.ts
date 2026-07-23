import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envDir: "../..",
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "firebase",
              test: (id) =>
                id.includes("/node_modules/") &&
                (id.includes("/firebase/") || id.includes("/@firebase/")),
              includeDependenciesRecursively: false,
              priority: 20
            },
            {
              name: "react-router",
              test: (id) =>
                id.includes("/node_modules/") &&
                (id.includes("/react-router/") ||
                  id.includes("/react-router-dom/")),
              includeDependenciesRecursively: false,
              priority: 15
            },
            {
              name: "react-vendor",
              test: (id) =>
                id.includes("/node_modules/") &&
                (id.includes("/react/") ||
                  id.includes("/react-dom/") ||
                  id.includes("/scheduler/")),
              includeDependenciesRecursively: false,
              priority: 10
            }
          ]
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/events": "http://localhost:3000"
    }
  }
});
