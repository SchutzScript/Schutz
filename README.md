# Schutz

> AI 연동이 극도로 쉽고, **AI가 코드를 고치는 과정을 실시간으로 멋지게 보여주는** AI 네이티브 IDE.

**Schutz**는 AI의 편집 행위를 **관찰 가능하고(observable) · 아름답게(beautiful) · 통제 가능하게(controllable)** 만드는 것을 목표로 하는 오픈소스 IDE 프로젝트입니다. 결과(diff)만 던지는 기존 AI 코딩 툴과 달리, Schutz는 **과정**을 보여줍니다 — AI가 무슨 파일을 왜 열고, 어떻게 고쳐 나가는지, 다음 계획이 무엇인지가 실시간 UI로 흐릅니다.

## 핵심 UX — 실시간 편집 시각화 (네 기둥)

1. **편집 과정 애니메이션** — AI가 코드를 타이핑하듯 흐르게, 바뀐 라인에 글로우 효과
2. **변경 diff 시각화** — 무엇이 왜 바뀌는지 명확한 diff + 라인별 수락/거절
3. **AI 작업 상태·계획 패널** — AI가 지금 뭘 왜 하는지, 다음 계획을 실시간 패널로
4. **멀티파일 동시 편집 뷰** — 여러 파일을 한 번에 고칠 때 전체를 조망

## 설계 원칙

- **Provider-agnostic** — Claude / OpenAI / Gemini / 로컬 모델을 어댑터로 교체
- **Observable by default** — AI의 모든 행동은 기본적으로 화면에 드러남
- **Human-in-the-loop** — 모든 변경은 수락/거절/되돌리기 가능
- **Progressive fidelity** — 확장(Extension)에서 검증 → 필요 시 Code-OSS 포크로 이전

## 프로젝트 상태

🚧 **Phase 1 — 동작하는 프로토타입.** 백엔드 없이 `mock` 프로바이더로 네 기둥 UX를 전부 데모할 수 있습니다. 상세 설계는 [docs/DESIGN.md](docs/DESIGN.md) 참고.

## 실행 방법

```bash
npm install
npm run compile      # 또는 npm run watch
npm test             # 스모크 테스트 (vscode 없이)
```

1. VSCode에서 이 폴더를 열고 **F5** (Run Schutz Extension) → 확장 개발 호스트가 뜹니다.
2. 개발 호스트에서 `examples/demo.ts` 를 엽니다.
3. 명령 팔레트(`Ctrl+Shift+P`) → **"Schutz: Run Demo Edit (Mock)"** 실행.
4. 편집이 타이핑 애니메이션 + 글로우와 함께 pending 으로 추가됩니다. 라인 위 CodeLens로 **수락/거절**, 또는 **"Schutz: Open Multi-file Overview"** 로 전체 조망.
5. 왼쪽 액티비티바의 **Schutz** 아이콘에서 채팅·Agent 활동 패널 확인.

> 실제 모델을 붙이려면 설정에서 `schutz.provider` 를 `claude` 로 바꾸고 `schutz.claude.apiKey` 를 입력하세요 (현재 Claude 어댑터는 텍스트 스트리밍만 실험 지원).

## 로드맵

- **Phase 1** — VSCode 확장 프로토타입으로 핵심 경험 검증
- **Phase 2** — Code-OSS 포크로 이전, 렌더러 레벨 시각 효과 완성
- **Phase 3** — 멀티 프로바이더 · 코드베이스 인덱싱 · 생태계

## 라이선스

MIT (예정) — [LICENSE](LICENSE) 참고.
