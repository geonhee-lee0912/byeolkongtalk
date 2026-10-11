"use client";

import { useEffect, useRef, useState } from "react";
import { BYEOLMARU_SUBSCRIPTION, TRIAL_DAYS } from "@/lib/byeolmaru/constants";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { RECHARGE_SOURCE } from "@/lib/analytics/recharge-source";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import RechargeSheet from "@/components/upsell/RechargeSheet";
import { BAIT, BAIT_SLOTS } from "@/lib/byeolmaru/bait";
import {
  subscribePhase,
  takeSubscribeResume,
  withSubscribeResume,
  type EntitlementSnapshot,
  type SubscribePhase,
  type SubscribeSurface,
} from "@/lib/byeolmaru/subscribe-offer";

const { cost: COST, days: DAYS } = BYEOLMARU_SUBSCRIPTION;

// 구독 확인창 부제 — 단계마다 "언제부터 30일인가"가 다르다(스펙 2026-10-11 §3-2, 사용자 결정).
// 체험 후는 예전 문구 그대로다. 구독 중은 화면에 버튼이 없어 거의 안 오지만, 다른 탭에서 막 산 뒤
// 남아 있던 버튼을 누르면 온다 — RPC 가 지금 구독 뒤에 이어 붙이므로 그 사실을 말한다.
const SUBTITLE: Record<SubscribePhase, string> = {
  pre_trial: `체험 ${TRIAL_DAYS}일 + ${DAYS}일 동안 매일 더 자세하게 오늘의 운세를 볼 수 있어`,
  trial: `체험 끝난 다음부터 ${DAYS}일 동안 매일 더 자세하게 오늘의 운세를 볼 수 있어`,
  post_trial: `${DAYS}일 동안 매일 더 자세하게 오늘의 운세를 볼 수 있어`,
  subscribed: `지금 구독이 끝난 다음부터 ${DAYS}일 더 이어서 볼 수 있어`,
};

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
// onChanged: 체험/구독 성공 후 그 뷰의 데이터 재조회(entitled 재판정). 각 뷰가 자기 refresh 를 넘긴다 —
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
  //    (확인 두 번 = 20별 두 번 차감 + 구독 이어 붙이기. 서버엔 중복 방지 키가 없다 — 스펙 §4-1).
  //    state(subscribing·trialStarting)는 버튼 라벨 '여는 중…'용이다. FortunePurchasePanel inFlightRef 와 같은 이유.
  const confirmLockRef = useRef(false);
  const trialLockRef = useRef(false);
  const resumeCheckedRef = useRef(false);

  const phase = ent ? subscribePhase(ent) : null;

  async function refreshView() {
    try {
      await onChanged();
    } catch {
      // 화면 갱신 실패 — 체험·구독은 이미 서버에 반영됐다. 다음 진입이 바로잡는다
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
      await fetch("/api/byeolmaru/trial", { method: "POST" });
      await refreshView();
    } catch {
      // 네트워크 실패 — 잠금만 풀어 다시 누를 수 있게 한다(서버 startTrial 은 1회성이라 재시도가 안전하다)
    } finally {
      trialLockRef.current = false;
      setTrialStarting(false);
    }
  }

  function showConfirm(next: Offer) {
    setOffer(next);
    setSubBalanceLoading(true);
    setSubBalance(null);
    void (async () => {
      try {
        const r = await fetch("/api/stars/balance", { cache: "no-store" });
        const d = r.ok ? await r.json() : null;
        setSubBalance(typeof d?.balance === "number" ? d.balance : 0);
      } catch {
        setSubBalance(0);
      } finally {
        setSubBalanceLoading(false);
      }
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
    try {
      let res: Response;
      try {
        res = await fetch("/api/byeolmaru/subscribe", { method: "POST" });
      } catch {
        trackUiEvent("byeolmaru_subscribe_failed", { meta: { ...meta, status: "network" } });
        setOffer(null);
        alert("구독이 안 됐어. 잠시 후 다시 시도해줄래?");
        return;
      }
      if (res.status === 402) {
        // 확인창을 연 뒤 잔액이 줄었다(다른 탭 결제 등). 서버 잔액으로 확인창을 '부족' 상태로 바꾸고
        // 그 위에 충전 시트를 연다 — 시트를 닫으면 '별 충전하러 가기' 확인창이 그대로 남는다.
        trackUiEvent("byeolmaru_subscribe_failed", { meta: { ...meta, status: 402 } });
        const j = await res.json().catch(() => null);
        setSubBalance(typeof j?.balance === "number" ? j.balance : 0);
        openRecharge(offer.surface);
        return;
      }
      if (res.ok) {
        trackUiEvent("byeolmaru_subscribe_completed", { meta: { stars: COST, ...meta } });
        // 헤더 잔액 칩 갱신 — 다른 구매 경로와 같은 이벤트(없으면 20별이 빠졌는데 헤더 숫자가 그대로다)
        window.dispatchEvent(new Event("byeolkong:balance-updated"));
        setOffer(null);
        await refreshView();
        return;
      }
      trackUiEvent("byeolmaru_subscribe_failed", { meta: { ...meta, status: res.status } });
      setOffer(null);
      alert("구독이 안 됐어. 잠시 후 다시 시도해줄래?");
    } finally {
      confirmLockRef.current = false;
      setSubscribing(false);
    }
  }

  // 충전하고 돌아오면 확인창을 **한 번만** 다시 연다(사용자 결정 2026-10-11). 자격을 읽은 뒤에야 판단한다 —
  // 이미 구독 중이면(다른 탭에서 샀다) 열지 않는다. 표시는 열든 안 열든 주소에서 지운다(새로고침에 또 뜨지 않게).
  // 🔴 한 화면에 이 훅이 둘 이상 떠도 표시를 먼저 읽은 쪽이 지우므로 한 번만 열린다(날짜 상세는 연 탭만 마운트).
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
    if (now === "subscribed") return;
    showConfirm({ surface, phase: now, resumed: true });
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
          subtitle={SUBTITLE[offer.phase ?? "post_trial"]}
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
