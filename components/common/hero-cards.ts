// 홈 히어로 캐러셀 카드 인벤토리 + 관객별 노출 정책 (순수 로직 · 테스트 대상).
// React·이미지 의존 없음 — HeroCarousel.tsx 가 이걸 소비한다.

export type Audience = "anon" | "new" | "returning";

export type Card = {
  id: string;
  img: string;
  title: string;
  desc: string;
  cta: string;
  href: string;
  audiences: Audience[]; // 이 카드를 보여줄 관객
};

// 08-02 통합 IA: 소개·첫충전·궁합·시뮬·설문·상담.
// audiences 규칙: 비로그인엔 구매유인(charge)·보상노동(survey) 숨김 / 기존 유저엔 intro("처음이지?") 숨김.
export const CARDS: Card[] = [
  { id: "intro", img: "/carousel/intro.webp", title: "별콩이는 처음이지?", desc: "타로와 사주로 마음의 흐름을 읽어줄게", cta: "사용법 보기", href: "/how-to-use", audiences: ["anon", "new"] },
  { id: "charge", img: "/carousel/charge.webp", title: "첫 충전엔 20% 더", desc: "지금 충전하면 별을 더 얹어줘", cta: "충전하기", href: "/shop", audiences: ["new", "returning"] },
  { id: "gonghap", img: "/carousel/gonghap.webp", title: "우리의 사주 궁합은?", desc: "두 사람 생년월일로 보는 인연", cta: "궁합 보기", href: "/fortune/compat", audiences: ["anon", "new", "returning"] },
  { id: "sim", img: "/carousel/sim.webp", title: "연애 시뮬레이션!", desc: "그 사람과의 여러 상황을 돌려봐", cta: "시작하기", href: "/relationship", audiences: ["anon", "new", "returning"] },
  { id: "survey", img: "/carousel/survey.webp", title: "별콩톡 설문조사", desc: "내 이야기를 들려주면 별콩별을 줄게", cta: "참여하기", href: "/survey", audiences: ["new", "returning"] },
  { id: "pass", img: "/carousel/pass.webp", title: "별콩이와 연애 상담", desc: "별콩이가 너를 계속 기억해줄게", cta: "보러가기", href: "/relationship", audiences: ["anon", "new", "returning"] },
];

// 관객 판정: 로그인 안 했으면 anon(이력 무관), 로그인했는데 이력 판정 불가면 null(로딩 기본값), 아니면 이력 유무로 new/returning.
export function resolveAudience(loggedIn: boolean, hasReadings: boolean | null): Audience | null {
  if (!loggedIn) return "anon";
  if (hasReadings === null) return null;
  return hasReadings ? "returning" : "new";
}

// 관객별 노출 카드. null(로딩 중)이면 전체를 보여준다(기존 동작 유지 — 판정 전 깜빡임 최소화).
export function visibleCards(audience: Audience | null): Card[] {
  if (audience === null) return CARDS;
  return CARDS.filter((c) => c.audiences.includes(audience));
}

// 시작 카드: 기존 유저는 신상품(시뮬)에서 시작, 그 외는 첫 카드(intro).
export function startIndex(audience: Audience | null, cards: Card[]): number {
  if (audience === "returning") {
    const idx = cards.findIndex((c) => c.id === "sim");
    if (idx >= 0) return idx;
  }
  return 0;
}
