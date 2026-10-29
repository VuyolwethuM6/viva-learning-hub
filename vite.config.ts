import { protectDevelopmentFiles } from "./scripts/dev-file-protection";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    fs: {
      deny: [
        ".env",
        ".env.*",
        "**/.env",
        "**/.env.*",
        "*.{crt,pem,key}",
        "**/*.{crt,pem,key}",
        "**/.git/**",
        "**/private/**",
      ],
    },
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    protectDevelopmentFiles(),
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
