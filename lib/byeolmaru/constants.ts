// lib/byeolmaru/constants.ts — 별마루 구독 상수. 클라이언트 세이프(서버 전용 import 없음).
// subscription.ts 는 getServiceSupabase(@/lib/supabase, 서비스 롤 키)를 물고 있어 클라 컴포넌트가
// 거기서 직접 import 하면 서버 전용 모듈이 번들에 딸려온다 — lib/relationship/types.ts 의
// PASS_PLANS 가 서버 전용 lib/relationship/passes.ts 와 분리돼 있는 것과 같은 이유로 분리한다.
export const BYEOLMARU_SUBSCRIPTION = { cost: 20, days: 30 } as const;

/** 우리 오늘 "지켜보는 상대" 슬롯. 2명 무료 + 3번째부터 WATCH_EXTRA_COST 별.
 * 구독(20별)의 작은 애드온 — 답변추천(SIM_SUGGEST_COST=5) 티어. 서버 권위(클라 cost 신뢰 X).
 * 옛 relationship SLOT_COST(50)와 별개(그건 /relationship 잔존용). */
export const WATCH_FREE_SLOTS = 2;
export const WATCH_EXTRA_COST = 5;

/** 우리 오늘 — **하루에 새로 생성할 수 있는 상대 리포트 수**(2026-09-24).
 *
 * 🔴 막는 지점이 "교체"가 아니라 "생성"인 이유: 원가는 상대를 바꿀 때가 아니라 **캐시 미스가
 *    날 때** 발생한다. `byeolmaru_pair_narrative` 가 (user, partner, 날짜) 키라 **이미 본 상대로
 *    되돌아가는 건 캐시 히트 = 원가 0** 이고, 그래서 이 상한은 되돌리기를 전혀 막지 않는다.
 *    (교체를 막았다면 "기록이 남아 되돌릴 수 있다"는 설계가 무의미해졌을 것이다.)
 *
 * 🔴 왜 필요한가 — 교체를 무료로 열면 생성 비용이 그대로 열린다. 실측 기반 계산(luna 생성당 ≈₩2.3,
 *    구독 20별 ≈₩1,600): 하루 1명이면 30일 ₩69(매출의 4%)지만 하루 10명이면 ₩690(43%),
 *    50명이면 ₩3,450(216% = 적자)다. 체험(3일 무료)은 매출이 0이라 그대로 손실이 된다.
 *
 * 🔴 카운터는 공짜다 — 별도 테이블 없이 `byeolmaru_pair_narrative` 의 (user_id, 오늘) 행 수가
 *    곧 "오늘 생성한 상대 수"다.
 *
 * 🔴 **페이월이 아니다.** 상한에 걸려도 "결제하면 더" 가 아니라 "오늘은 여기까지"다 —
 *    교체 과금을 기각한 것과 같은 이유(바꾸는 순간이 대개 관계가 끝난 순간이다).
 *    무료 taste 는 룰 100%·원가 0이라 상한과 무관하게 **항상** 보인다.
 *
 * 값 1 = "한 사람을 매일 본다"는 상품 정의 그대로. 체험자도 동일(사용자 확정). */
export const PAIR_REPORT_DAILY_LIMIT = 1;
