// lib/byeolmaru/bait.ts — 페이월 미끼 카피(스펙 §9). 순수(LLM·네트워크 0).
// 🔴 "첫 줄"을 LLM 으로 만들지 않는다. /api/byeolmaru/daily-report 는 비자격자에게 403 이라
//    실제 리포트를 가져올 수 없고(원가 경계), 스펙이 "첫 줄은 위 무료 요약을 **이어받아** 쓴다"고
//    명시했다. 그래서 화면에 이미 떠 있는 것(등급 라벨·상대 이름)을 받아 룰로 잇는다 — 원가 0.
// 🔴 자물쇠를 쓰지 않는다. 유료라는 사실은 "구독" 배지가 남기고, 문장은 초대여야 한다(스펙 §9 톤).

export const BAIT_SLOTS = ["saju_report", "woori_30d", "tarot_rich"] as const;
export type BaitSlot = (typeof BAIT_SLOTS)[number];

export interface BaitCopy {
  /** 자물쇠 대신 오는 초대 한 줄. */
  title: string;
  /** "길다·정확하다"를 말이 아니라 증거로 — 분량과 구성(2탭 FORTUNE_LENGTH_HINT 관행 재사용). */
  chips: string[];
  /** 첫 줄 뒤에 이어지다 페이드로 흐려지는 꼬리. 끝을 맺지 않는다(— 로 끊는다). */
  tail: string;
}

export const BAIT: Record<BaitSlot, BaitCopy> = {
  saju_report: {
    title: "별콩이가 더 깊이 읽어줄게",
    chips: ["약 2,100자", "재물 · 직장 · 애정 · 건강 · 학업"],
    // 🔴 "오늘" 금지 — 이 자리는 SajuTodayView 날짜 선택 화면에 붙고, 선택된 셀은
    //    과거 날짜일 수 있다(cell = cells.find(date===selected) ?? todayCell). "오늘"을
    //    박으면 지난 날을 보는 사용자에게 거짓말이 된다(saju-taste.json 40문장 정정 전례).
    tail: "네 월·시 기둥까지 겹쳐서 어디에 힘을 실으면 좋을지—",
  },
  woori_30d: {
    title: "둘 사이를 매일 짚어줄게",
    chips: ["이번 달 전체", "끌림 · 결속 · 삐걱"],
    tail: "언제 마음이 가까워지고 언제 한 박자 쉬면 좋은지, 날짜로—",
  },
  tarot_rich: {
    title: "이 카드를 네 사주에 얹어줄게",
    chips: ["약 800자", "카드 × 네 사주"],
    tail: "같은 카드도 사람마다 다르게 내려앉는데, 너한테는—",
  },
};

/** 첫 줄이 받을 맥락 — 화면에 **이미 떠 있는 것**만 넣는다(새로 계산하지 않는다). */
export interface BaitContext {
  /** 오늘 등급 라벨("잘 맞는 날"…). 허브 히어로·오늘 사주 상세에 이미 보인다. */
  gradeLabel?: string;
  /** 인연 탭에서 고른 상대 이름. */
  partnerName?: string;
}

/**
 * 무료 요약을 이어받는 첫 줄(스펙 §9). 무료→유료가 **한 흐름**으로 읽히게 한다 —
 * 광고 문구가 아니라 방금 읽은 것의 다음 문장처럼.
 * 맥락이 없으면 그것 없이도 말이 되는 문장으로 떨어진다(undefined 가 새면 안 된다).
 */
export function baitLead(slot: BaitSlot, ctx: BaitContext): string {
  if (slot === "saju_report") {
    // 라벨이 있으면 화면(DayDetailCard/히어로)에 뜬 그 등급을 그대로 인용한다 — 오늘일 때만 실린다.
    // 🔴 폴백이 "오늘"을 말하는 건 의도다. 이 폴백에 도달하는 실사용 경로는 "과거 날을 보는 중"
    //    뿐이고(SajuTodayView 가 그때 라벨을 빼서 넘긴다), 그때 파는 물건은 여전히 오늘 리포트다
    //    (daily-report 라우트에 날짜 파라미터가 없다). 선택한 날을 가리키면 못 지킬 약속이 된다.
    return ctx.gradeLabel
      ? `위에서 본 '${ctx.gradeLabel}'이 왜 그런지부터 풀어줄게.`
      : "오늘은 왜 이런 결인지부터 풀어줄게.";
  }
  if (slot === "woori_30d") {
    // woori_30d 는 허브 인연 탭 전용 — 날짜 선택 화면이 없어 "오늘" 기준이 항상 참이다.
    return ctx.partnerName
      ? `${ctx.partnerName}와 너, 오늘 왜 이런 결인지부터 짚어줄게.`
      : "둘이 오늘 왜 이런 결인지부터 짚어줄게.";
  }
  // tarot_rich 도 오늘의 카드 자리라 "지금"이 항상 참이다.
  return "이 카드가 지금 네 흐름에 어떻게 걸리는지부터 말해줄게.";
}
