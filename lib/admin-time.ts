// lib/admin-time.ts — 어드민 집계의 날짜 경계 (KST 기준).
// 서버(Vercel)는 UTC 로 돌기 때문에 "오늘"을 KST(UTC+9) 자정 기준으로 계산한다.
//
// 🔴 기준은 하나다 — KST 자정. (2026-07-31 통일)
//    이전엔 어드민 트래픽/대시보드만 **오전 10시 롤오버**를 써서, 같은 "오늘"이 화면마다 다른
//    날을 뜻했다(/admin·/admin/traffic vs /admin/analytics·연애 일일 턴).
//    10시의 명목상 이유는 "밤사이 한 세션이 두 날짜로 쪼개지는 것 방지"였는데 prod 실측으로
//    기각됐다 — 자정을 걸치는 세션은 325건 중 2건(0.62%)뿐이고, 반대로 10시 버킷은 캘린더
//    날짜와 어긋난 **이틀 걸친 창**이라 distinct UV 를 부풀렸다(07-25: 10시 63 vs 자정 27 = 2.3배).
//    자정은 Meta 광고 리포트·토스 정산·GA 와도 대조된다 — 10시로는 그게 불가능했다.
//    남은 "밤 세션 갈림"은 방문일 귀속을 **세션 시작 시점**으로 옮겨 직접 해결한다
//    (admin_traffic_visitor_mix RPC 의 SESSION_GAP 주석 참조).
//
// ⚠️ 유저에게 적용되는 제품 규칙은 이 모듈의 대상이 아니다 — 연애 일일 턴 소프트캡은
//    lib/relationship/passes.ts 가 자체적으로 KST 자정을 쓴다(집계 리팩터로 건드리지 말 것).
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 오늘 0시를 UTC ISO 로 반환. */
export function startOfTodayKstIso(): string {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - KST_OFFSET_MS).toISOString();
}

/**
 * UTC ISO → KST 날짜(YYYY-MM-DD). 날짜 버킷의 **단일 원천** — 집계 모듈은 전부 이걸 쓴다
 * (중복 정의 = 드리프트). SQL 쪽 대응식은 `(created_at at time zone 'UTC' + interval '9 hours')::date`
 * 이고, `at time zone 'UTC'` 를 빼면 캐스트가 세션 TimeZone 에 좌우되므로 반드시 유지한다.
 */
export function kstDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

/** KST 기준 n일 전 0시를 UTC ISO 로 반환 (오늘 포함 7일이면 daysAgoKstIso(6)). */
export function daysAgoKstIso(days: number): string {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() - days);
  return new Date(shifted.getTime() - KST_OFFSET_MS).toISOString();
}
