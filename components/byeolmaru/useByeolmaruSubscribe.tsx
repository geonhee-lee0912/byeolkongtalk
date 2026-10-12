"use client";

import { useEffect, useRef, useState } from "react";
import { BYEOLMARU_SUBSCRIPTION, TRIAL_DAYS } from "@/lib/byeolmaru/constants";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { RECHARGE_SOURCE } from "@/lib/analytics/recharge-source";
import { purchaseRequest, type PurchaseResponse } from "@/lib/tarot/purchase-request";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import RechargeSheet from "@/components/upsell/RechargeSheet";
import { BAIT, BAIT_SLOTS } from "@/lib/byeolmaru/bait";
import {
  BYEOLMARU_REQUEST_TIMEOUT_MS,
  ENTITLEMENT_CHANGED_EVENT,
  alreadySubscribedNotice,
  shouldResumeSubscribe,
  subscribePhase,
  takeSubscribeResume,
  withSubscribeResume,
  type EntitlementSnapshot,
  type SubscribePhase,
  type SubscribeSurface,
} from "@/lib/byeolmaru/subscribe-offer";

const { cost: COST, days: DAYS } = BYEOLMARU_SUBSCRIPTION;

// 구독 확인창 부제 — 단계마다 "언제부터 30일인가"가 다르다(스펙 2026-10-11 §3-2, 사용자 결정).
// 체험 후는 예전 문구 그대로다. 🔴 구독 중 문구는 없다(2026-10-12) — 구독자 화면엔 구독 버튼이 없고, 낡은 화면에서
// 눌러도 그 화면의 단계는 '구독 중'이 아니다(낡았으니까). 그 구매는 서버가 차감 없이 409 로 막는다(handleConfirm).
const SUBTITLE: Record<Exclude<SubscribePhase, "subscribed">, string> = {
  pre_trial: `체험 ${TRIAL_DAYS}일 + ${DAYS}일 동안 매일 더 자세하게 오늘의 운세를 볼 수 있어`,
  trial: `체험 끝난 다음부터 ${DAYS}일 동안 매일 더 자세하게 오늘의 운세를 볼 수 있어`,
  post_trial: `${DAYS}일 동안 매일 더 자세하게 오늘의 운세를 볼 수 있어`,
};

// 결과를 모르는 실패(연결 끊김·15초 시간 초과) — 서버엔 반영됐을 수 있어 화면을 새로 읽고 그걸 보게 한다.
// 다시 눌러도 안전한 건 **첫 요청이 이미 커밋된 경우뿐**이다: 체험 시작은 1회성이라 늘 안전하고, 구독은 이미 구독 중이면
// 서버가 409 로 막는다(차감 없음). 첫 요청이 서버에서 아직 안 끝났으면(15초 시간 초과 직후) 바로 다시 누른 요청은
// 그 409 판정(RPC 잠금 밖)을 통과해 20별을 또 뺄 수 있다 — 그래서 구독의 시간 초과 안내는 재시도를 권하지 않는다.
const LOST_RESPONSE_NOTICE = "연결이 흔들렸어. 화면을 새로 불러올게 — 버튼이 그대로면 다시 눌러줄래?";
const SUBSCRIBE_TIMEOUT_NOTICE = "응답이 늦어서 결과를 아직 몰라. 이미 구독됐을 수 있으니, 잠시 뒤 화면을 새로 불러와서 구독 상태부터 확인해줘.";

/** 구독 라우트 응답 — 성공(phase·days·expiresAt) · 402(balance) · 409(expiresAt) · 그 밖의 실패(error). */
interface SubscribeBody {
  error?: string;
  balance?: number;
  expiresAt?: string;
  phase?: string;
  days?: number;
}

/** 확인창을 연 맥락 — 완료·실패 계측과 충전 후 재오픈 표시가 이걸 쓴다. phase 는 연 순간의 단계다. */
interface Offer {
  surface: SubscribeSurface;
  slot?: string;
  phase: SubscribePhase | null;
  /** 충전하고 돌아와 자동으로 다시 연 확인창 — 클릭이 아니다 */
  resumed: boolean;
}

function offerMeta(o: Offer): Record<string, unknown> {
  return {
    surface: o.surface,
    ...(o.phase ? { phase: o.phase } : {}),
    ...(o.slot ? { slot: o.slot } : {}),
    ...(o.resumed ? { resumed: true } : {}),
  };
}

// 별마루 trial/subscribe 공유 훅 — 허브·saju·tarot·woori 네 뷰가 같은 결제 흐름을 쓴다.
// onChanged: 체험/구독 뒤 그 화면의 자격 재조회(entitled 재판정). 허브는 자기 reloadAfterChange, 날짜 상세의 세 뷰는
//   껍데기(DayTabsView)의 캘린더 다시 받기를 넘긴다 — 열린 탭 전부가 같이 바뀐다(syncEntitlement 주석).
//   🔴 둘 다 **못 읽으면 지금 화면을 그대로 둔다**(acceptReloadedCalendar) — 이 훅은 실패·시간 초과 뒤에도 부르므로, 진입용
//   refresh 를 넘기면 오프라인에서 허브가 통째로 '못 펼쳤어'로 바뀌어 다시 누를 버튼이 사라진다.
//   Promise 를 돌려주면 끝날 때까지 체험 버튼이 '여는 중…'으로 남는다(원래 문구로 한 번 깜빡이지 않게).
// ent: 그 뷰가 지금 아는 자격(캘린더 응답). 확인창 문구·계측 phase·충전 후 재오픈 판정이 쓴다. 로딩 중엔 null.
export function useByeolmaruSubscribe(
  onChanged: () => void | Promise<void>,
  ent: EntitlementSnapshot | null
) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [subBalance, setSubBalance] = useState<number | null>(null);
  const [subBalanceLoading, setSubBalanceLoading] = useState(false);
  // 그 자리 충전 시트 — 열려 있을 때만 returnTo 를 든다(null = 닫힘)
  const [rechargeReturnTo, setRechargeReturnTo] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [trialStarting, setTrialStarting] = useState(false);
  // 🔴 진행 중 잠금은 ref 다 — state 는 다음 렌더에야 보여서 같은 틱의 두 번째 탭이 그대로 통과한다
  //    (확인 두 번 = 요청 두 번. 둘째는 이제 서버가 409 로 막지만(2026-10-12) 두 요청이 '동시'면 못 막는다 — 스펙 §4-1).
  //    state(subscribing·trialStarting)는 버튼 라벨 '여는 중…'용이다. FortunePurchasePanel inFlightRef 와 같은 이유.
  const confirmLockRef = useRef(false);
  const trialLockRef = useRef(false);
  const resumeCheckedRef = useRef(false);

  const phase = ent ? subscribePhase(ent) : null;

  // 자격이 바뀌었을 수 있다 — 체험·구독의 성공뿐 아니라 409·실패·시간 초과 뒤에도 부른다(응답을 못 받았어도 서버엔
  // 반영됐을 수 있다 — iOS 앱 전환 등). ① window 에 알려 같은 화면의 다른 탭도 새 자격을 받게 하고
  // (byeolmaru:entitlement-changed → DayTabsView 가 캘린더를 다시 받아 열린 탭 전부에 내려준다 — 예전엔 누른 탭만
  // 새로 고쳐, 다른 탭에 남은 구독 버튼이 20별을 또 뺐다) ② 이 화면의 새로 읽기(onChanged)를 기다린다.
  // 날짜 상세에선 ②가 ①과 같은 다시 받기라 요청은 한 번이다(DayTabsView 가 합친다).
  // 🔴 헤더 잔액 칩도 여기서 같이 다시 받게 한다(byeolkong:balance-updated — 다른 구매 경로와 같은 이벤트). 성공만이 아니라
  //    결과를 모르는 실패(시간 초과·연결 끊김·5xx)에도 서버에선 20별이 이미 빠졌을 수 있다 — 안 보내면 헤더 숫자가 그대로다.
  //    (체험 시작엔 차감이 없어 잔액 조회가 한 번 헛걸음이다 — 감수한다.)
  // notice: 함께 띄울 짧은 안내 — 요청을 먼저 걸어 둔 뒤 띄운다(alert 가 막는 동안에도 다시 읽기는 간다).
  async function syncEntitlement(notice?: string) {
    window.dispatchEvent(new Event(ENTITLEMENT_CHANGED_EVENT));
    window.dispatchEvent(new Event("byeolkong:balance-updated"));
    const refreshed = Promise.resolve(onChanged());
    if (notice) alert(notice);
    try {
      await refreshed;
    } catch {
      // 화면 갱신 실패 — 낡은 구독 버튼은 서버가 409 로 막고(차감 없음) 체험 시작은 1회성이다. 다음 진입이 바로잡는다
    }
  }

  // slot 은 호출부가 아는 "어느 미끼에서 눌렀는가"다(P5-4 §13) — 옵셔널이라 슬롯을 모르는
  // 호출부(허브 배너)는 slot 없이 찍힌다.
  async function startTrial(slot?: string) {
    if (trialLockRef.current) return;
    trialLockRef.current = true;
    setTrialStarting(true);
    // ⚠️ 잠금 뒤라 연타가 한 번만 찍힌다 — 잠금 전(2026-10-11 이전) events 수와 비교하지 말 것(실인원은 같다)
    trackUiEvent("byeolmaru_trial_started", slot ? { meta: { slot } } : undefined);
    try {
      let notice: string | undefined;
      try {
        // 15초 제한 — 응답이 영영 안 오면 버튼이 '여는 중…'에 갇힌다
        const r = await purchaseRequest("/api/byeolmaru/trial", { method: "POST" }, BYEOLMARU_REQUEST_TIMEOUT_MS);
        if (!r.ok) notice = "체험이 안 열렸어. 잠시 후 다시 시도해줄래?";
      } catch {
        // 연결 끊김·시간 초과 — 결과를 모른다(서버 startTrial 은 1회성이라 다시 눌러도 안전하다)
        notice = LOST_RESPONSE_NOTICE;
      }
      // 실패여도 다시 읽는다 — 서버엔 반영됐을 수 있다
      await syncEntitlement(notice);
    } finally {
      trialLockRef.current = false;
      setTrialStarting(false);
    }
  }

  // 별 잔액 — 못 읽으면 null(확인창은 0 으로 보고 '충전하러 가기'를 띄운다 · 충전 후 재오픈은 안 연다)
  async function fetchStarBalance(): Promise<number | null> {
    try {
      const r = await fetch("/api/stars/balance", { cache: "no-store" });
      const d = r.ok ? await r.json() : null;
      return typeof d?.balance === "number" ? d.balance : null;
    } catch {
      return null;
    }
  }

  function showConfirm(next: Offer) {
    setOffer(next);
    setSubBalanceLoading(true);
    setSubBalance(null);
    void (async () => {
      const b = await fetchStarBalance();
      setSubBalance(b ?? 0);
      setSubBalanceLoading(false);
    })();
  }

  // surface = 구독 선택지가 그려진 자리(스펙 §5) · phase = 누른 순간의 단계(이 뷰의 ent).
  function openSubscribe(surface: SubscribeSurface, slot?: string) {
    const next: Offer = { surface, slot, phase, resumed: false };
    trackUiEvent("byeolmaru_subscribe_clicked", { meta: offerMeta(next) });
    showConfirm(next);
  }

  // 그 자리 충전 시트(FortunePurchasePanel 관례) — returnTo 에 표시(bm_sub)를 실어 보낸다. 결제하고 /shop 이
  // 돌려보내면 돌아온 화면이 확인창을 한 번 다시 연다(아래 effect). 예전엔 /shop 으로 통째 이동해
  // 별마루로 돌아올 길이 없었다(402 는 need 도 없이 /shop).
  function openRecharge(surface: SubscribeSurface) {
    setRechargeReturnTo(withSubscribeResume(window.location.pathname, window.location.search, surface));
  }

  async function handleConfirm() {
    if (!offer || confirmLockRef.current) return;
    confirmLockRef.current = true;
    setSubscribing(true);
    const meta = offerMeta(offer);
    let r: PurchaseResponse<SubscribeBody> | null = null;
    let lost: "timeout" | "network" = "network";
    try {
      // 15초 제한 — 처리 중엔 확인창을 못 닫아서(아래 onClose) 응답이 영영 안 오면 갇힌다
      r = await purchaseRequest<SubscribeBody>("/api/byeolmaru/subscribe", { method: "POST" }, BYEOLMARU_REQUEST_TIMEOUT_MS);
    } catch (e) {
      // AbortError = 우리 타이머가 끊었다(시간 초과) · 그 밖 = 연결 끊김. 둘 다 결과를 모른다
      if ((e as { name?: unknown } | null)?.name === "AbortError") lost = "timeout";
    } finally {
      // 🔴 응답(또는 시간 초과)까지만 잠근다 — 뒤의 화면 새로 읽기까지 잡고 있으면, 그게 늦을 때 새로 연 확인창이
      //    '여는 중…'에 갇혀 닫히지도 않는다. 그 사이 다시 산다고 눌러도 서버가 409 로 막는다(차감 없음).
      confirmLockRef.current = false;
      setSubscribing(false);
    }
    if (!r) {
      trackUiEvent("byeolmaru_subscribe_failed", { meta: { ...meta, status: lost } });
      setOffer(null);
      // 시간 초과만 재시도를 권하지 않는다 — 첫 요청이 서버에서 아직 안 끝났을 수 있다(LOST_RESPONSE_NOTICE 주석). 연결 끊김은 그대로
      await syncEntitlement(lost === "timeout" ? SUBSCRIBE_TIMEOUT_NOTICE : LOST_RESPONSE_NOTICE);
      return;
    }
    if (r.status === 402) {
      // 확인창을 연 뒤 잔액이 줄었다(다른 탭 결제 등). 서버 잔액으로 확인창을 '부족' 상태로 바꾸고
      // 그 위에 충전 시트를 연다 — 시트를 닫으면 '별 충전하러 가기' 확인창이 그대로 남는다.
      trackUiEvent("byeolmaru_subscribe_failed", { meta: { ...meta, status: 402 } });
      setSubBalance(typeof r.data.balance === "number" ? r.data.balance : 0);
      openRecharge(offer.surface);
      return;
    }
    if (r.status === 409) {
      // 이미 구독 중 — 이 화면이 낡았다(다른 탭에서 막 샀다). 서버가 차감 없이 막았다(2026-10-12) — 알리고 화면을 새로 읽는다
      trackUiEvent("byeolmaru_subscribe_failed", { meta: { ...meta, status: 409 } });
      setOffer(null);
      await syncEntitlement(alreadySubscribedNotice(r.data.expiresAt));
      return;
    }
    if (r.ok) {
      // phase·days 는 **서버가 판정한 값**(구독 라우트 응답)으로 싣는다 — 확인창을 연 순간 화면이 안 단계(clicked 의 phase)와
      // 다를 수 있다(다른 탭에서 체험을 시작한 뒤 등). 실제 일수의 정본은 구독 행 expires_at 이다.
      const server = {
        ...(typeof r.data.phase === "string" ? { phase: r.data.phase } : {}),
        ...(typeof r.data.days === "number" ? { days: r.data.days } : {}),
      };
      trackUiEvent("byeolmaru_subscribe_completed", { meta: { stars: COST, ...meta, ...server } });
      // 헤더 잔액 칩 갱신은 syncEntitlement 가 한다(20별이 빠졌는데 헤더 숫자가 그대로이면 안 된다)
      setOffer(null);
      await syncEntitlement();
      return;
    }
    trackUiEvent("byeolmaru_subscribe_failed", { meta: { ...meta, status: r.status } });
    setOffer(null);
    // 5xx 도 다시 읽는다 — 서버엔 반영됐는데 응답만 잃었을 수 있다
    await syncEntitlement("구독이 안 됐어. 잠시 후 다시 시도해줄래?");
  }

  // 충전하고 돌아오면 확인창을 **한 번만** 다시 연다(사용자 결정 2026-10-11). 자격을 읽은 뒤에야 판단한다 —
  // 이미 구독 중이면(다른 탭에서 샀다) 열지 않는다. 표시는 열든 안 열든 주소에서 지운다(새로고침에 또 뜨지 않게).
  // 🔴 **충전하고 돌아왔을 때만** 연다 = 잔액이 20 이상일 때만(2026-10-12, shouldResumeSubscribe) — 결제 실패·취소 뒤
  //    /shop 의 '← 대화로 돌아가기'도 같은 returnTo(표시 포함)로 와서, 예전엔 잔액 그대로 '부족' 창이 또 떴다.
  // 🔴 한 화면에 이 훅이 둘 이상 떠도 표시를 먼저 읽은 쪽이 지우므로 한 번만 열린다(날짜 상세는 연 탭만 마운트).
  //    그래서 주소 정리는 잔액을 묻기 **전에** 동기로 한다.
  useEffect(() => {
    if (!ent || resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;
    const { found, surface, rest } = takeSubscribeResume(window.location.search);
    if (!found) return;
    // 🔴 router.replace 금지(대기 중인 이동을 버린다) · state 를 null 로 덮지 말 것(첫 로드에 Next 의 __NA 가
    //    지워져 뒤로 가기가 라우터를 못 탈 수 있다) — app/tarot/draw/page.tsx dropQueryKeys 와 같은 방식·같은 이유.
    //    대가도 같다: useSearchParams() 는 이 화면을 떠날 때까지 옛 쿼리다(이 표시를 그걸로 읽는 곳은 없다).
    try {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest}${window.location.hash}`);
    } catch {
      // 정리는 편의다 — 실패해도 재오픈 판단은 이어 간다
    }
    if (!surface) return;
    const now = subscribePhase(ent);
    if (now === "subscribed") return; // 잔액을 물을 것도 없다
    void (async () => {
      const balance = await fetchStarBalance();
      if (!shouldResumeSubscribe(now, balance)) return;
      // 방금 읽은 잔액으로 바로 연다 — showConfirm 처럼 한 번 더 묻지 않는다
      setOffer({ surface, phase: now, resumed: true });
      setSubBalance(balance);
      setSubBalanceLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ent]);

  const subscribeModal = (
    <>
      {offer && (
        <StarConfirmModal
          cost={COST}
          balance={subBalance}
          loading={subBalanceLoading}
          busy={subscribing}
          accent="#E8C26A"
          title="별마루 구독"
          subtitle={SUBTITLE[offer.phase === "pre_trial" || offer.phase === "trial" ? offer.phase : "post_trial"]}
          confirmLabel={subscribing ? "여는 중…" : "구독하기"}
          surface={RECHARGE_SOURCE.byeolmaruSubscribe}
          // 구독 시트 전용 — 전체 가치 3종 + 가격을 여기서 한 번 크게(스펙 §9). 카피는 BAIT(허브·
          // 상세뷰 미끼 문구)에서 그대로 끌어와 중복 저작을 피한다.
          // 🔴 2026-10-11 부터 체험 전·체험 중에도 여기 온다(체험 전 절단선 링크·체험 중 리포트 끝 넛지) —
          //    예전 전제 "여기 오는 사람은 전원 체험 후"가 깨졌다. 그래서 "언제부터 30일인가"는 부제가
          //    단계별로 말하고(SUBTITLE), 아래 안심 문구는 단계와 무관하게 참인 사실 — 자동갱신 없음 — 을
          //    답한다(purchase_byeolmaru_subscription 은 1회성 20별 차감, 정기결제 아님).
          extra={
            <div className="border-t border-lilac-mid/20 pt-4 mb-5">
              {/* 🔴 `mb-6` — 가치 3줄과 가격 사이를 벌린다(2026-09-27, 사용자 요청). 예전 `mb-3`(12px)
                  에선 "20별 / 30일"이 세 번째 항목의 넷째 줄처럼 붙어 읽혔다. */}
              <ul className="space-y-1 mb-6">
                {BAIT_SLOTS.map((slot) => (
                  <li key={slot} className="flex items-start gap-1.5 text-[13px] leading-snug">
                    <span aria-hidden className="text-eye-purple shrink-0">✦</span>
                    <span>
                      <span className="font-medium text-eye-purple">{BAIT[slot].title}</span>
                      <span className="text-eye-purple/85 text-[12px]"> · {BAIT[slot].chips[0]}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-center font-display text-xl font-bold text-eye-purple">
                {COST}별 / {DAYS}일
              </p>
              <p className="mt-2 text-center text-[11px] text-eye-purple/85">
                {offer.phase === "pre_trial" ? `체험 ${TRIAL_DAYS}일 + ${DAYS}일` : `${DAYS}일`} 지나면 그냥 끝나 — 자동으로 또 빠져나가지 않아.
              </p>
            </div>
          }
          onConfirm={handleConfirm}
          onCharge={() => openRecharge(offer.surface)}
          // 처리 중엔 안 닫는다 — 닫힌 뒤 응답이 오면 402 의 충전 시트가 맥락 없이 뜬다
          onClose={() => {
            if (!confirmLockRef.current) setOffer(null);
          }}
        />
      )}
      {/* 🔴 열릴 때만 마운트 — 시트는 useTossPayment 를 불러 마운트만으로 /api/auth/me + 토스 SDK
          초기화가 돈다(FortunePurchasePanel 관례). need·잔액을 넘겨 부족분 맞춤 기본 칸이 고른다. */}
      {rechargeReturnTo && (
        <RechargeSheet
          open
          returnTo={rechargeReturnTo}
          need={COST}
          balance={subBalance}
          source={RECHARGE_SOURCE.byeolmaruSubscribe}
          onClose={() => setRechargeReturnTo(null)}
        />
      )}
    </>
  );

  return { startTrial, trialStarting, openSubscribe, subscribeModal };
}
