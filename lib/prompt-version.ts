// 상담(사주·타로) 리딩 생성 시 박는 페르소나/프롬프트 버전 라벨 — 전후 데이터 비교용.
// ⚠️ data/persona/* 또는 lib/claude.ts 의 대화 프롬프트를 의미있게 바꾸면 이 값을 새 dated 슬러그로 올릴 것.
// 히스토리:
//   pre-2026-07-12            — 버전 스탬프 도입 전 (baseline, 마이그레이션에서 백필)
//   2026-07-12-persona-tuning — 확답 회피·심문 피로·길이 완화 + [END] 유예 (커밋 3fe4d6b·68934e5)
//   2026-07-13-conversion-c1  — 더보고싶다 신호·방향먼저·회피구1회·크로스셀 문구·종료턴 방향답 우선 (spec: 2026-07-13-conversion-moment)
//   2026-07-13-conversion-c2  — [RECO:] 마커 방출 (인챗 추천 카드·결과 추천 인프라)
//   2026-07-13-conversion-c3  — clarifier·연장 제안 ([RECO:tarot:clarifier]/[RECO:extend] + 더보고싶다 3갈래)
//   2026-07-17-persona-v3     — 당기는 별콩이: 공통 코어 분리 + 소신 화법·관찰형 훅·마무리 3택·회피구 0회
//                               + 턴 신호 동적 강제 + 호칭 (spec: 2026-07-17-w4-persona-v3, 커밋 1efd649·eee051f)
export const PROMPT_VERSION = "2026-07-17-persona-v3";
