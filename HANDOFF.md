# HANDOFF — 작업 구조 적용 — 공통 규칙·절차·로드맵
- 마지막 갱신: 2026-10-31 · 자리: 클라우드/Codex

## 목표
`AGENTS.md` 공통 규칙에 일의 단위(브랜치 = 일 = HANDOFF.md)·시작·종료·자리 옮기기를 넣고, `scripts/agent/{start,stop}.sh` 를 만들고, `init.sh` 가 비밀값 없는 클라우드에서도 통과하게 고치고, `ROADMAP.md`·HANDOFF 가드·결정 카드를 더한다. 설계는 회사 저장소(비공개) `docs/2026-10-31-작업-구조-design.md`.

## 지금 상태
- 된 것: `init.sh` 비밀값 0 통과(+ `.env.local` 따옴표·CR 해석), `start.sh`·`stop.sh` 신설과 시험 6개 통과, `AGENTS.md` 공통 규칙·명령 절 수정, `ROADMAP.md`, `.github/workflows/handoff-guard.yml`, `docs/decisions/2026-10-31-작업-구조.md`.
- 돌려 본 것: `npx tsc --noEmit --incremental false` 0 에러, 유닛 테스트 전부 통과(`node --test`, exit 0).
- 남은 것: 운영자의 실물 확인(아래 1) → 이 파일 삭제 → PR.

## 다음 할 일 (순서대로)
1. 운영자가 클라우드 세션(Claude Code 웹, 그다음 Codex 클라우드)으로 이 브랜치를 열어 `scripts/agent/start.sh` 를 돌리고 이 파일의 "자리" 줄을 고쳐 **같은 브랜치**에 푸시한다 [어디서든]
2. 결과에 따라 `AGENTS.md` "자리·도구 옮기기" 항목에 대안 문장 추가(안 될 때만) [어디서든]
3. 이 파일 삭제 → PR(base dev) → `@codex review` [어디서든]

## 확인 못 한 것
- 클라우드 세션이 기존 브랜치에서 시작해 같은 브랜치에 푸시할 수 있는지(위 1 이 바로 그 확인)
- `handoff-guard` 워크플로는 PR 을 열어야 돈다 — 로컬에선 같은 셸 한 줄만 확인함

## 건드리면 안 되는 것
- `AGENTS.md` 의 공통 규칙 절 밖(기술 스택·페르소나·코딩 규칙·운영 함정)은 손대지 않는다.
- `dev` 에 직접 푸시하지 않는다.
