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
  /** 별마루 — 날짜 셀 클릭. meta:{offset:오늘 기준 일수 차이(과거 음수), tone:"good"|"normal"|"caution",
   *  subjectKind:"me"|"pair"(나/우리 축 — offset≠0 비율 관문의 사후 필터링에 필요),
   *  surface:"strip"|"grid"}
   *  🔴 surface 없이는 P6-3 이후 이 이벤트가 **두 지면에서 같은 모양으로** 나와 영영 못 가른다.
   *     스펙 §10 의 첫 관문("한 달 조망이 필요한가")은 격자를 펼친 수가 아니라 **격자에서 실제로
   *     날짜를 고른 수**로 답해야 하는데, 그 분해가 이 필드 하나에 달려 있다.
   *  ⚠️ P6-3 배포일에 이 이벤트의 **구성**이 꺾인다(격자 기본 접힘 + 스트립 신설) — 이름이 같아도
   *     추세선 단절이 있으니 행동 변화로 오독하지 말 것. */
  "byeolmaru_day_selected",
  /** 별마루 — 우리 사이·시뮬 슬롯 클릭(→/relationship 유출)
   *  🔴 **2026-09-24 부터 영구 0** — 발화처였던 PartnerSlot.tsx 를 삭제했다. 그 카드는 이미
   *     2026-09-05(별마루 3a)에 화면에서 빠져 파일만 남아 있었고, 우리 오늘이 별마루 안에서
   *     자립한 지금은 /relationship 으로 내보낼 이유가 없다.
   *     상수는 과거 판독용으로 남긴다(gate_dismissed·watch_limit 과 같은 관행). */
  "byeolmaru_slot_clicked",
  /** 별마루 — 사주 프로필 없어 캘린더를 못 그린 진입(퍼널 이탈 지점) */
  "byeolmaru_no_profile",
  /** 별마루 — 비로그인 진입(하단탭에서 눌렀으나 세션 없음) */
  "byeolmaru_need_login",
  /** 별마루 — 페이월 미끼 노출(슬롯 노출마다 1회 — slot 이 바뀌면 같은 마운트에서도 다시 찍힌다).
   *  meta:{slot:"saju_report"|"woori_30d"|"tarot_rich", surface:"bait_card"|"cut"}
   *  🔴 surface 없이는 P6-4 의 핵심 가설("절단선이 별도 미끼 카드보다 파는가")을 영영 못 읽는다.
   *     `saju_report` 는 허브 나 탭(미끼 카드)과 사주 상세(절단선)가 **같은 slot 값**을 쓰기 때문이다 —
   *     그 분해가 이 필드 하나에 달려 있다. 자리가 아니라 **형태**를 가른다(자리는 slot 이 이미 안다):
   *     bait_card=PremiumBlock · cut=PaywallCut 에 하드코딩이라 호출부 prop 은 없다.
   *  ⚠️ P6-4 배선일에 이 값의 **수준이 뛴다**(사주 상세·타로). PaywallCut 이 그 두 자리에서
   *     PremiumBlock 을 대체하며 접기를 없앴는데, PremiumBlock 은 `!dismissed` 조건으로 그날 접은
   *     유저의 재방문을 분모에서 뺐다. 이건 스펙 §13 "어느 미끼가 파는가"의 **분모**라 전환율이
   *     떨어진 것처럼 보인다. surface 로 갈라 봐도 배선일을 사이에 둔 **수준 비교는 금물**이다
   *     (형태가 갈릴 뿐 접힘 억제가 돌아오지는 않는다) — 행동 변화로 오독하지 말 것.
   *  🔴 2026-09-24 이후 **미끼 카드(PremiumBlock)는 서비스에 없다** — 허브는 그 블록을
   *     통째로 지웠고(판매는 상세 절단선이 맡는다) 우리 오늘은 PaywallCut 으로 바뀜다.
   *     그래서 `surface` 는 그날 이후 사실상 항상 "cut" 이고, "bait_card" 는 과거 데이터에만
   *     남는다. **절단선 vs 미끼 카드 비교는 끝난 실험이다** — 별마루가 prod 에 나간 적이
   *     없어 표본이 0 인 채로 닫혔다(재개하려면 미끼 카드를 되살려야 한다).
   *  🔴 같은 날 `saju_report` 의 허브분 노출이 사라져 그 slot 은 **상세 하나로** 줄어든다.
   *  ⚠️ 2026-09-21(허브 1인칭 정리) 경계에서 **`woori_30d` 가 아래로 내려앉는다** — 허브 인연 칩이
   *     사라져 노출 면이 "허브 + 우리 오늘 화면" 둘에서 **우리 오늘 하나**로 줄었다. 반대로 진입이
   *     칩 1탭에서 무료 목록 행으로 바뀌었으니 도달 자체도 달라진다. 이 경계를 사이에 둔
   *     `woori_30d` 수준 비교는 금물이고, 앞뒤를 볼 땐 `byeolmaru_free_item_clicked`
   *     (meta.item="woori")를 분모로 같이 읽을 것. */
  "byeolmaru_gate_shown",
  /** 별마루 — 페이월 미끼 닫기(당일 접힘).
   *  meta:{slot:"saju_report"|"woori_30d"|"tarot_rich", surface:"bait_card"}
   *  🔴 **2026-09-24 부터 이 이벤트는 어느 slot 에서도 안 찍힐다 — 영구히 0.**
   *     접기는 PremiumBlock 에만 있었고 그 컴포넌트가 삭제됐다(PaywallCut 은 리포트 본문의
   *     가려진 부분이라 접으면 그 자리가 통째로 빈다). 상수는 과거 데이터 판독을 위해 남긴다.
   *  ⚠️ P6-4 배선일에 꺾인다(PaywallCut 에는 접기가 없다). slot 별로 다르다:
   *     `tarot_rich` 는 **영구히 0**(그 자리의 유일한 소스가 PaywallCut 이 된다) /
   *     `saju_report` 는 0 이 아니라 **허브 나 탭분만 남아 내려앉는다**(사주 상세가 PaywallCut 으로
   *     바뀐다 — 허브/상세 분해는 위 gate_shown 의 surface 가 한다) /
   *     `woori_30d` 도 2026-09-24 부터 0(그 자리도 PaywallCut 이 됐다). 추세선 단절이니 행동 변화로 오독하지 말 것. */
  "byeolmaru_gate_dismissed",
  /** 별마루 — 3일 무료 체험 시작 클릭. meta:{slot?} */
  "byeolmaru_trial_started",
  /** 별마루 — 구독 CTA 클릭. meta:{slot?} */
  "byeolmaru_subscribe_clicked",
  /** 별마루 — 구독 결제 완료. meta:{stars} */
  "byeolmaru_subscribe_completed",
  /** 별마루 우리오늘 — 칩에서 상대 선택. meta:{}
   *  🔴 2026-09-21 경계에서 **뜻이 좁아진다.** 이전엔 허브 달력 판의 인연 칩 + 우리 오늘 화면의
   *     토글 둘이 찍어 사실상 "우리 오늘 도달"이었다. 허브 칩이 사라진 뒤로는 우리 오늘 화면에서
   *     **상대를 손으로 바꾼 것**만 남는다 — 상대가 1명인 사람은 자동 선택으로 열리므로 이 이벤트가
   *     아예 안 찍힌다. 도달은 `byeolmaru_free_item_clicked`(meta.item="woori")로 옮겨 읽을 것.
   *  🔴 **2026-09-24 부터 영구 0** — 상대가 한 명이 되어 고를 대상이 없어졌다(칩 삭제).
   *     상수는 과거 데이터 판독을 위해 남긴다. */
  "byeolmaru_partner_selected",
  /** 별마루 우리오늘 — 상대 설정 성공. meta:{via:"pick"|"register"}
   *  🔴 2026-09-24 부터 뜻이 "담기"에서 **"교체"** 로 바뀐다(상대가 한 명). 경계 앞뒤로 같은
   *     이벤트지만 앞은 "N번째 추가", 뒤는 "지금 상대를 이 사람으로"다 — 누적으로 세지 말 것. */
  "byeolmaru_watch_add",
  /** 별마루 우리오늘 — 무료 슬롯 초과로 5별 확인창 도달. meta:{cost}
   *  🔴 **2026-09-24 부터 영구 0** — 슬롯·과금(2무료+5별)을 없앴다. 교체는 무료고, 원가는
   *     교체가 아니라 생성에서 막는다(PAIR_REPORT_DAILY_LIMIT). 상수는 과거 판독용으로 남긴다.
   *     🔴 dev·prod 통틀어 실제 발화 **0건**이었다 — 지우는 비용이 애초에 0이었다는 기록. */
  "byeolmaru_watch_limit",
  /** 별마루 우리오늘 — 추가 상대 5별 결제 완료. meta:{stars}
   *  🔴 **2026-09-24 부터 영구 0**(위와 같은 이유). 발화 이력 0건. */
  "byeolmaru_watch_purchase",
  /** 별마루 우리오늘 — 담기 모달에서 관계칩 선택(pick·register 공통). meta:{status} */
  "byeolmaru_watch_status_set",
  /** 별마루 우리오늘 — 락 티저 CTA로 체험/구독 개시. meta:{action:"trial"|"subscribe"} */
  "byeolmaru_subscribe_from_woori",
  /** 별마루 — 비로그인 게스트 구경 그리드 카드 클릭. meta:{card(안정 key), gated} */
  "byeolmaru_guest_peek_clicked",
  /** 별마루 — 오늘 타로·오늘 사주 카톡 공유 버튼 클릭. meta:{kind:"tarot"|"saju"} */
  "byeolmaru_share_clicked",
  /** 별마루 — 무료 목록 5종 행 클릭.
   *  meta:{item:"saju_today"|"tarot"|"woori"|"mbti"|"byeoljari"}
   *  (saju_today 는 P6-3 에서 합류 — 오늘 사주가 달력 안 히어로 타일에서 목록으로 내려왔다)
   *  🔴 `woori` 는 2026-09-21 합류 — 허브 달력을 1인칭 전용으로 정리하면서 우리 오늘의 진입이
   *     달력 판 상단 인연 칩에서 이 목록 행으로 내려왔다. 그래서 이 값은 신규 항목이 아니라
   *     **옮겨온 진입점**이다: 이전엔 `byeolmaru_partner_selected` 가 그 도달을 재고 있었으니
   *     우리 오늘 도달 추세를 이을 때 경계 앞은 그 이벤트, 뒤는 이 값으로 읽어야 한다. */
  "byeolmaru_free_item_clicked",
  /** 홈 우리 사이(연애 상담) 진입 카드 클릭 — 구 궁합 슬롯 대체(계측 부재 반복 방지) */
  "home_relationship_clicked",
  /** 별마루 — 스트립의 안 온 날(흐린 칸) 탭. meta:{offset, subjectKind} — "앞으로 3일"이 체험 전환을 만드는지(§10) */
  "byeolmaru_strip_future_tapped",
  /** 별마루 — 월간 격자 펼침/접힘. meta:{open} — §2-2 "한 달 조망이 필요한가" 가설의 관문(§10) */
  "byeolmaru_month_grid_toggled",
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
