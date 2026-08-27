import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxyTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Через bind-mount в Docker Desktop файловые события не доходят,
    // поэтому опрашиваем файлы — иначе HMR молчит на изменения.
    watch: {
      usePolling: true,
      interval: 300,
    },
    // Браузер открыт на хосте, поэтому HMR-сокет должен стучаться на
    // localhost, а не на внутреннее имя контейнера.
    hmr: {
      host: "localhost",
      port: 5173,
    },
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
      },
      // Загруженные аватарки и логотипы отдаёт бэкенд статикой.
      "/uploads": {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
});
