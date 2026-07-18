import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Electron 패키징 시 file:// 로드에서도 에셋 경로가 깨지지 않도록 상대 경로
  base: "./",
  server: { port: 4322, strictPort: true },
  build: {
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        // 거대한 단일 청크(4.7MB)에서 자기완결형 대형 라이브러리만 분리 — 병렬 로드·캐시 효율.
        // react 등 상호의존 벤더는 초기화 순서(TDZ) 문제를 피하려 index 에 남긴다.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("monaco-editor")) return "monaco";
          if (id.includes("@xterm") || id.includes("/xterm")) return "xterm";
          if (id.includes("onigasm") || id.includes("monaco-textmate") || id.includes("monaco-editor-textmate")) return "textmate";
        },
      },
    },
  },
});
