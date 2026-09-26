// lib/byeolmaru/bait.ts — 페이월 미끼 카피(스펙 §9). 순수(LLM·네트워크 0).
// 🔴 "첫 줄"을 LLM 으로 만들지 않는다. /api/byeolmaru/daily-report 는 "오늘 + 캐시 미스 + 비자격"
//    일 때만 403 이라(2026-09-26, 스펙 §4-4 — 그 전엔 비자격자 전체가 403 이었다) 그 경우엔 실제
//    리포트를 가져올 수 없고(원가 경계), 스펙이 "첫 줄은 위 무료 요약을 **이어받아** 쓴다"고
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
    chips: ["이번 달 전체", "설렘 · 척척 · 삐걱"],
    tail: "언제 마음이 가까워지고 언제 한 박자 쉬면 좋은지, 날짜로—",
  },
  // 🔴 이 카피는 더 이상 **렌더되지 않는다**(P6-4 Task 9). 유일한 소비자였던 DailyCardBlock 의
  //    PremiumBlock 이 PaywallCut 으로 바뀌었고, PaywallCut 은 BAIT 를 읽지 않는다(분량·섹션 칩은
  //    paywall-sections.ts 가 준다). 슬롯 이름 "tarot_rich" 자체는 PaywallCut 의 slot prop 과
  //    gate_shown meta 로 **계속 살아 있으므로** 항목을 지우지 말 것 — 다만 아래 문구를 다듬는 건
  //    지금은 아무 화면도 바꾸지 않는다(고치려거든 PaywallCut 쪽을 볼 것).
  tarot_rich: {
    title: "이 카드를 네 사주에 얹어줄게",
    chips: ["약 1,800자", "카드 × 네 사주"],
    tail: "같은 카드도 사람마다 다르게 내려앉는데, 너한테는—",
  },
};

// 🔴 baitLead / BaitContext / particleWaGwa 는 2026-09-24 삭제됐다 — 유일한 소비처가
//    PremiumBlock(미끼 카드)였고 그 컴포넌트가 없어졌다(페이월은 PaywallCut 하나로 통일).
//    PaywallCut 은 분량·섹션 칩을 paywall-sections.ts 에서 받아 BAIT 카피를 안 읽는다.
//    아래 BAIT 는 살아 있다 — 구독 시트(useByeolmaruSubscribe)가 자리별 제목·칩을 그대로 쓴다.
