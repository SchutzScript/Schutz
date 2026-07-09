import { defineConfig } from "astro/config";

// VSCode 웹뷰용 정적 빌드.
// - format: "file"  → dist/chat.html 처럼 평평하게 출력(확장이 읽기 쉬움)
// - assets: "_astro" → 해시된 에셋은 dist/_astro/ 아래 (확장이 경로 재작성)
// - inlineStylesheets: "never" → CSS를 외부 파일로 빼서 CSP(script/style-src)로 허용 가능
export default defineConfig({
  outDir: "./dist",
  build: {
    format: "file",
    assets: "_astro",
    inlineStylesheets: "never",
  },
  // 하이드레이션 스크립트를 외부 모듈로 (인라인 스크립트 최소화 → CSP 친화적)
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
