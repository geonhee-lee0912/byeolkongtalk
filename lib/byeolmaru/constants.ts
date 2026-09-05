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
