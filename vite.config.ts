import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    // Define missing WebSocket token to prevent runtime errors
    __WS_TOKEN__: JSON.stringify(''),
    // Define other potentially missing Vite environment variables
    __VITE_IS_MODERN__: true,
    __VITE_LEGACY__: false,
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      port: 8081, // Use different port for HMR
      clientPort: 8081,
      overlay: false,
    },
  },
  plugins: [
    react(),
    // Temporarily disabled lovable-tagger to resolve __WS_TOKEN__ error
    // mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
