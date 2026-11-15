# 신년운세 시즌 콘텐츠 — 2027년 사주 분석

- 마지막 갱신: 2026-11-15 · 자리: 로컬(Claude, 워크트리 `.claude/worktrees/saju-2027`)

## 목표
사주 운세 탭에 "2027년 사주 분석"(`saju_2027`, 60별) 상품을 추가한다. 설계 `docs/superpowers/specs/2026-11-15-2027-사주분석-design.md` · 계획 `docs/superpowers/plans/2026-11-15-2027-사주분석.md`.

## 지금 상태
- 계획 Task 1~4 끝(연도 사양·프롬프트·상품 정의·결과 화면·소개 문구·추천 연결). 타입 0 · 테스트 전체 통과
- dev 서버(로컬 3027)에서 `/fortune?chip=timing` 에 2026 앞으로 진열, `/fortune/saju_2027` 소개 페이지 정상
- 그림 3장(붉은 양)은 운영자 프롬프트 승인 대기. 그 전까지 목록 아이콘은 타로 공용 그림, 소개 카드 그림 없음, 결과 화면 히어로는 기본 별콩이

## 다음 할 일
- [로컬에서] 붉은 양 그림 3장 생성·배치(Task 5) — 아이콘 `public/icons/fortune/saju_2027.webp` · 카드 `public/fortune/card/saju_2027.webp` · 결과 `public/fortune-hero-saju_2027.webp`, 그리고 `FortuneIcon.tsx` HAS_ICON · `hero.ts` HERO·CARD_KEYS
- [어디서든] 빌드 → ROADMAP "신년운세 시즌 콘텐츠" 끝남으로 · 이 파일 삭제 → PR(base dev) → `@codex review`

## 확인 못 한 것
- 리포트 실제 생성(AI 비용 — 운영자 허락 뒤). 그래서 2027 결과 화면 실물도 아직 못 봤다(테스트로는 저장본·목차·프롬프트를 고정)

## 건드리면 안 되는 것
- 2026 저장본(`year2026` 필드) 읽기 호환 — `saju-full-report.test.ts`
- `saju_full` 프롬프트 문자열 — `prompt.test.ts` 의 sha256
- `saju_full` 진열·가격
