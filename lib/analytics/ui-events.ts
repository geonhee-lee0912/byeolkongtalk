// UI 이벤트 계측 — 이벤트 이름 allowlist(서버·클라 공용 원천) + 클라 전송 헬퍼.
//
// 왜 별도 파일인가: allowlist 를 라우트(app/api/event)와 호출처가 같은 원천으로 봐야 한다.
// Next 는 route.ts 의 export 를 검사하므로 상수를 거기 둘 수 없다.
//
// ⚠️ /api/pv 재사용 금지 — pv 는 normalizePath 로 라우트 표를 만들기 때문에 가짜 경로를
//    넣으면 /admin/traffic 이 오염된다 (supabase/migrations/20260731070000_ui_events.sql 참조).

/**
 * 서버가 받아들이는 이벤트 이름. 오타가 조용히 새 버킷을 만들어 아무도 집계하지 않는 일을 막는다.
 * 값을 추가할 때 마이그레이션은 필요 없다(테이블의 event 는 자유 문자열) — 여기만 늘리면 된다.
 */
export const UI_EVENTS = [
  /** 출구 칩(✨ 결과 카드 보기) 노출 — 리딩당 1회 */
  "exit_chip_shown",
  /** 출구 칩 탭 */
  "exit_chip_clicked",
  /** 사주 운세 탭 카테고리 칩 선택 — meta.category 에 love_relation|timing|free */
  "fortune_chip_clicked",
  /** 홈 히어로 캐러셀 배너 클릭 — meta.slot 에 카드 id(intro|charge|gonghap|sim|survey|pass) */
  "banner_clicked",
  /** 별자리 초대 링크 복사(초대 발신) — meta.shareId */
  "byeoljari_invite_clicked",
  /** 사주 MBTI 퍼널 — intro 시작(quiz 진입) */
  "saju_mbti_started",
  /** 사주 MBTI — 문항 완료→생일 단계 진입(단계 이탈 분리) */
  "saju_mbti_birth",
  /** 사주 MBTI — 결과 산출 완료. meta:{palja,self,band,element} (비-PII) */
  "saju_mbti_completed",
  /** 사주 MBTI — 공유 발신. meta:{palja, via:"native"|"copy"} */
  "saju_mbti_shared",
  /** 사주 MBTI — 친구가 공유 결과 도착(티저 마운트). meta:{fromPalja} */
  "saju_mbti_shared_view",
  /** 사주 MBTI — 친구가 "나도 해보기". meta:{fromPalja} */
  "saju_mbti_retry",
  /** 결제 퍼널 — 충전 시트/샵 열림. meta:{source:"inchat"|"shop"} */
  "recharge_sheet_opened",
  /** 결제 퍼널 — 패키지 선택(유저 탭). meta:{source, packageId} */
  "recharge_package_selected",
  /** 결제 퍼널 — 결제 시작(토스 호출 직전). meta:{source, packageId, amountWon} */
  "recharge_payment_started",
  /** 결과 화면 CTA 클릭. meta:{cta:"continue"|"new"|"first_charge"|"cross_sell", product?} */
  "result_cta_clicked",
  /** 별마루 — 캘린더 날짜 셀 클릭. meta:{offset:0~29, tone:"good"|"normal"|"caution"} */
  "byeolmaru_day_selected",
  /** 별마루 — 우리 사이·시뮬 슬롯 클릭(→/relationship 유출) */
  "byeolmaru_slot_clicked",
  /** 별마루 — 사주 프로필 없어 캘린더를 못 그린 진입(퍼널 이탈 지점) */
  "byeolmaru_no_profile",
  /** 별마루 — 비로그인 진입(하단탭에서 눌렀으나 세션 없음) */
  "byeolmaru_need_login",
] as const;

export type UiEvent = (typeof UI_EVENTS)[number];

export function isUiEvent(v: unknown): v is UiEvent {
  return typeof v === "string" && (UI_EVENTS as readonly string[]).includes(v);
}

/** 유저가 실제로 발화한 턴 수. ephemeral(부재·출구 멘트)은 화면 전용이라 제외한다. */
export function countUserTurns(
  messages: readonly { role: string; ephemeral?: boolean }[]
): number {
  return messages.filter((m) => m.role === "user" && !m.ephemeral).length;
}

/**
 * 클라 → /api/event 발사 후 망각(fire-and-forget).
 *
 * 절대 throw 하지 않고 절대 await 하지 않는다 — 계측이 제품 동작(종료 → 결과 화면)을
 * 1ms 도 붙잡으면 안 된다. 오프라인·4xx·네트워크 끊김 전부 무음이고, unhandled rejection
 * 조차 남기지 않는다(콘솔 노이즈가 곧 다음 사람의 오진이 된다).
 *
 * 탭 직후 화면 전환과 경쟁할 수 있어 sendBeacon 우선 + keepalive fetch 폴백
 * (components/analytics/PageViewBeacon 과 동일 관행).
 */
export function trackUiEvent(
  event: UiEvent,
  payload?: { readingId?: string | null; meta?: Record<string, unknown> }
): void {
  if (typeof navigator === "undefined") return;
  try {
    const body = JSON.stringify({
      event,
      readingId: payload?.readingId ?? undefined,
      meta: payload?.meta,
    });
    const blob = new Blob([body], { type: "application/json" });
    // sendBeacon 은 큐가 차면 false 를 준다(예외 아님) → 그때만 fetch 로 재시도
    if (navigator.sendBeacon?.("/api/event", blob)) return;
    void fetch("/api/event", {
      method: "POST",
      body,
      keepalive: true,
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  } catch {
    // 계측 실패는 무음
  }
}
