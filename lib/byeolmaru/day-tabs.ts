// lib/byeolmaru/day-tabs.ts — 날짜 상세(/byeolmaru/day)의 탭 정의. 순수 · 네트워크 0.
// 🔴 순서는 허브 무료 목록(FreeList buildDailyItems)과 같다 — 두 입구가 같은 순서를 말해야
//    "목록에서 본 그것"과 "탭에서 보는 그것"이 같은 물건으로 읽힌다.

export type DayTab = "saju" | "tarot" | "woori";

export const DAY_TABS: readonly { key: DayTab; label: string }[] = [
  { key: "saju", label: "사주" },
  { key: "tarot", label: "타로" },
  { key: "woori", label: "우리" },
];

/** 기본 탭. 🔴 달력 칸에 찍힌 숫자·색이 **사주 일진 점수**라, 칸을 눌렀을 때 다른 탭이 열리면
 *  "내가 누른 숫자"와 화면이 어긋난다(스펙 §2 결정 2). */
export const DEFAULT_DAY_TAB: DayTab = "saju";

/** 신뢰 불가 입력(쿼리스트링) → 탭 키. 모르는 값은 조용히 기본 탭으로 떨어뜨린다.
 *  🔴 캐스팅으로 대신하지 말 것 — enum 밖 값이 새면 config 조회가 undefined 를 물고 렌더가
 *     통째로 죽는다(2026-08-02 prod 사고, lib/reco-utils.ts 의 같은 교훈). */
export function parseDayTab(raw: unknown): DayTab {
  return DAY_TABS.some((t) => t.key === raw) ? (raw as DayTab) : DEFAULT_DAY_TAB;
}

/** 자격이 바뀐 뒤(byeolmaru:entitlement-changed) 껍데기가 다시 받은 캘린더 응답을 열린 탭들에 내려줄까.
 *  본문 있는 2xx·401·404 만 — 각 탭이 그 상태를 판단한다(401 = 로그인 벽, 404 = 생일 없음이지만 타로는 자격으로 그린다).
 *  🔴 5xx·본문 깨짐은 버리고 지금 스냅샷을 그대로 둔다 — 진입 때와 달리 이미 그려 둔 탭이 있어, 덮으면 세 탭이 통째로
 *     '못 펼쳤어'가 되고 읽던 리포트를 잃는다. 낡은 채 남는 구독 버튼은 서버가 409 로 막고(차감 없음) 체험 시작은 1회성이다. */
export function acceptReloadedCalendar(status: number, body: unknown): boolean {
  return status === 401 || status === 404 || (status >= 200 && status < 300 && body != null);
}
