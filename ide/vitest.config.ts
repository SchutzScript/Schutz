import { defineConfig } from "vitest/config";

/**
 * 엔진 전용 테스트 설정.
 *
 * environment: "node" — src/engine 은 React·DOM·Electron 을 import 하지 않는 순수 모듈이라
 * jsdom 이 필요 없다. import 0 규칙을 지키면 받는 보상이고, 동시에 그 규칙을 강제하는 장치다.
 * 엔진 코드에 실수로 DOM 을 끌어들이면 여기서 바로 터진다.
 *
 * vite.config.ts 를 상속하지 않는다 — react 플러그인과 monaco 청크 분할은 테스트에 불필요하고
 * 로드만 느려진다.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/engine/**/*.test.ts", "src/opening/**/*.test.ts"],
  },
});
