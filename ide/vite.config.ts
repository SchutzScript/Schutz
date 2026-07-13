import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Electron 패키징 시 file:// 로드에서도 에셋 경로가 깨지지 않도록 상대 경로
  base: "./",
  server: { port: 4322, strictPort: true },
});
