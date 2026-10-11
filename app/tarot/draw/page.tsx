"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SPREAD_INFO,
  getPositionLabels,
  type DrawnCard,
} from "@/lib/tarot/spreads";
import {
  TAROT_SPREAD_KEY,
  TAROT_DRAW_KEY,
  type TarotSpreadSelection,
  type TarotDrawResult,
} from "@/lib/tarot/session";
import { tarotPrice } from "@/lib/tarot/pricing";
import { spendConsent } from "@/lib/tarot/menu-session";
import { fetchWallet } from "@/lib/wallet";
import { entryFeaturesOn, isNewFlowGuest } from "@/lib/tarot/entry-ab";
import { guestSheetLine } from "@/lib/tarot/guest-price";
import {
  clearPendingDraw,
  loadPendingDraw,
  matchesSelection,
  parseResume,
  restoreSession,
  resumeHref,
  savePendingDraw,
  type ResumeVia,
} from "@/lib/tarot/pending-draw";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { WELCOME_BONUS_STARS } from "@/lib/constants";
import ProgressSteps from "@/components/concern/ProgressSteps";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import CardDrawRitual from "@/components/tarot/CardDrawRitual";
import CardReveal from "@/components/tarot/CardReveal";
import LoginSheet from "@/components/tarot/LoginSheet";
import RechargeSheet from "@/components/upsell/RechargeSheet";
import { RECHARGE_SOURCE } from "@/lib/analytics/recharge-source";

type SheetTrigger = "auto" | "reopen" | "fail";

/** 콜백 실패 사유는 쿼리라 누구나 넣을 수 있다 — 콜백이 쓰는 모양(영문·숫자·밑줄 40자)만 그대로 계측한다 */
const LOGIN_FAIL_REASON = /^[A-Za-z0-9_]{1,40}$/;

export default function TarotDrawPage() {
  const router = useRouter();
  const [selection, setSelection] = useState<TarotSpreadSelection | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pendingDrawn, setPendingDrawn] = useState<DrawnCard[] | null>(null);
  // 별 결제 확인 팝업 — 가격·잔액은 뽑기가 끝난 순간 서버에서 다시 읽어 정한다
  const [showConfirm, setShowConfirm] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [rechargeSheetOpen, setRechargeSheetOpen] = useState(false);
  // 잔액·그룹을 읽는 중 안내 — prod 는 확인 팝업을 바로 띄워 '…' 를 보였지만 이제 팝업은 그룹 가격을 읽은 뒤에 뜬다(다른 곳 #8)
  const [checking, setChecking] = useState(false);
  // 잔액을 못 읽었다(실패·5초 초과) — 팝업 대신 '다시 눌러줘' 한 줄. 완료 버튼을 다시 누르면(onDrawn) 지우고 다시 읽는다
  const [walletError, setWalletError] = useState(false);
  // 로그인 전 맛보기(스펙 2026-10-11-타로-로그인전-맛보기) — 공개한 카드(로그인·결제·홈에서 돌아와 복원한 판 포함)
  const [revealed, setRevealed] = useState<DrawnCard[] | null>(null);
  // 새 흐름 그룹 비로그인으로 판정됨 — 확인 팝업 대신 로그인 창
  const [guestMode, setGuestMode] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [guestPrice, setGuestPrice] = useState<number | null>(null);
  const [sheetPriceText, setSheetPriceText] = useState("");
  // 로그인 실패로 돌아옴 — 창에 "다시 눌러줘"
  const [loginFailed, setLoginFailed] = useState(false);
  // 다시 온 회원 — 로그인 전 '가입 선물'을 보고 왔는데 선물이 없고 별이 모자란 만큼(스펙 §4)
  const [returningShort, setReturningShort] = useState<number | null>(null);
  const [welcomeToast, setWelcomeToast] = useState(false);
  // 이 화면에 들어온 길 — resume=login|payment|home(lib/tarot/pending-draw)
  const resumeRef = useRef<ResumeVia | null>(null);
  // 복원한 판의 자동 이어가기는 한 번만(CardReveal 의 공개 완료 콜백이 부른다)
  const autoRanRef = useRef(false);
  // 대화로 넘어가는 중 / 잔액 확인 중 — 완료 버튼 연타로 두 번 이동·두 번 조회하지 않게
  const leavingRef = useRef(false);
  const checkingRef = useRef(false);
  // 이 화면이 떠 있는가 — 잔액을 읽는 사이 뒤로 가기로 떠났으면 응답이 와도 대화로 끌고 가지 않는다(router.push 는 컴포넌트 수명과 무관한 전역 이동이라 떠난 뒤에도 차감된다)
  const aliveRef = useRef(false);
  useEffect(() => {
    aliveRef.current = true; // 본문에서 다시 켠다 — 개발 StrictMode 의 가짜 언마운트(cleanup 뒤 재실행) 뒤에도 영구히 꺼져 있지 않게
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // 선택 정보 로드 — /tarot(메뉴판 또는 옛 스프레드 고르기) 또는 맛보기 끝 "이어서 깊게".
  // 로그인·결제·홈에서 돌아온 판은 저장된 진행으로 복원한다(뽑기 의식 건너뜀 — 스펙 §5-2).
  // 새 장치가 꺼져 있으면(스위치 'old' — 지금 prod) 복원·이어가기 표시·실패 표시를 보지 않는다 — 켰다가 되돌려도 남은 저장이 결제 막다른 길로 끌고 가지 않게
  useEffect(() => {
    const featuresOn = entryFeaturesOn();
    const params = new URLSearchParams(window.location.search);
    const via = featuresOn ? parseResume(window.location.search) : null;
    resumeRef.current = via;
    if (params.get("welcome") === "1") setWelcomeToast(true);
    const failed = featuresOn && params.get("login") === "fail";
    if (failed) {
      setLoginFailed(true);
      const reason = params.get("reason") ?? "";
      trackUiEvent("login_fail_shown", { meta: { reason: LOGIN_FAIL_REASON.test(reason) ? reason : "other" } });
      // 실패 표시는 한 번만 — 새로고침에 다시 뜨지 않게 주소에서 뺀다(AuthBootstrap 은 성공 콜백만 정리한다)
      params.delete("login");
      params.delete("reason");
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }

    let sel: TarotSpreadSelection | null = null;
    try {
      const raw = sessionStorage.getItem(TAROT_SPREAD_KEY);
      sel = raw ? (JSON.parse(raw) as TarotSpreadSelection) : null;
    } catch {
      sel = null;
    }

    const saved = featuresOn ? loadPendingDraw(localStorage) : null;
    if (saved && (via || matchesSelection(saved, sel))) {
      setSelection(restoreSession(sessionStorage, saved));
      setRevealed(saved.drawnCards);
      setMounted(true);
      // 실패로 돌아온 복원도 여기 찍힌다 — 성공 복귀로 오독하지 않게 표시를 붙인다
      trackUiEvent("pending_draw_resumed", { meta: { via: via ?? "match", ...(failed ? { loginFailed: true } : {}) } });
      return;
    }
    if (via) trackUiEvent("pending_draw_missing", { meta: { via } });
    if (!sel) {
      router.replace("/tarot");
      return;
    }
    setSelection(sel);
    setMounted(true);
  }, [router]);

  // 가입 선물 토스트 — 막지 않고 잠깐
  useEffect(() => {
    if (!welcomeToast) return;
    const t = setTimeout(() => setWelcomeToast(false), 2600);
    return () => clearTimeout(t);
  }, [welcomeToast]);

  const labels = useMemo(
    () =>
      selection
        ? getPositionLabels(
            selection.spreadType,
            selection.spreadCategory,
            selection.emotion
          )
        : [],
    [selection]
  );

  if (!selection || !mounted) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">카드를 섞는 중…</p>
      </main>
    );
  }

  const info = SPREAD_INFO[selection.spreadType];
  const accent = info.accent;
  const cardCount = info.cardCount;
  const spreadType = selection.spreadType;
  // 새 장치(진행 저장·회원 충전 왕복 복원) — 스위치가 'old' 면 꺼져 지금 prod 그대로(스펙 §5-2 · §8)
  const featuresOn = entryFeaturesOn();

  // 뽑은 카드는 인자로 받는다 — setPendingDrawn 직후의 state 는 아직 옛 값이다
  // price = 이 판에 보여 준(쓴) 가격(팝업 가격 · 팝업 생략이면 그 자리에서 계산한 가격) — 대화 화면이 서버에 실어 보내 서버 가격과 대조한다(다르면 차감 없이 409)
  const goToReading = (drawn: DrawnCard[], price: number) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    // 동의는 한 판에 한 번 — 이 판을 시작하는 모든 길(팝업 생략·팝업 확인)에서 여기서 소모한다.
    // 뒤로 가 다시 뽑으면 확인 팝업이 다시 뜬다(Task 4·8 리뷰). 충전 경로는 여기를 안 거쳐 동의가 남는다.
    if (selection.consented) setSelection(spendConsent(sessionStorage, selection));
    // sessionStorage 로 넘기고 /tarot/reading 이 직접 POST — 동의 표시는 대화로 넘기지 않는다(필드를 골라 담는다)
    const payload: TarotDrawResult = {
      spreadType: selection.spreadType,
      spreadCategory: selection.spreadCategory,
      emotion: selection.emotion,
      concern: selection.concern,
      drawnCards: drawn,
      expectedCost: price,
    };
    sessionStorage.setItem(TAROT_DRAW_KEY, JSON.stringify(payload));
    router.push("/tarot/reading");
    // 이 판을 시작했으니 저장해 둔 진행은 더 필요 없다(뒤로 가 다시 들어와도 복원하지 않게).
    // 🔴 이동 뒤에 지운다 — 스위치 'old'(지금 prod)에서도 도는 줄이라, localStorage 접근 자체가 던지는 브라우저여도 풀이 시작을 막지 않게
    clearPendingDraw(localStorage);
  };

  const openSheet = (trigger: SheetTrigger, price: number) => {
    setSheetOpen(true);
    trackUiEvent("login_sheet_shown", {
      meta: { spread: spreadType, price, short: Math.max(0, price - WELCOME_BONUS_STARS), trigger },
    });
  };

  // 카드를 다 뽑으면 잔액·반반 그룹을 그 자리에서 읽어 이번 판 가격을 정한다(서버 차감과 같은 tarotPrice).
  //  - 로그인 전 맛보기(새 흐름 그룹 비로그인) — 확인 팝업 대신 카드 공개 + 로그인 창. 진행을 저장해 로그인 뒤 이어간다(스펙 §3·§5-2)
  //  - 메뉴판 그룹 + 메뉴판에서 동의한 선택(consented)이고 잔액이 충분하면 확인 팝업 없이 바로 대화로(스펙 §4)
  //  - 그 밖(옛 그룹 = 지금 prod 흐름 · 잔액 부족)은 확인 팝업 → 잔액 부족이면 충전 시트
  //    (그 팝업의 잔액 부족 노출이 paywall_shown = Meta AddToCart 원천이라 자리를 그대로 둔다)
  //  - 못 읽으면(실패·5초 초과) 팝업 없이 '다시 눌러줘' 한 줄 — 완료 버튼을 다시 누르면 다시 읽는다
  const onDrawn = (drawn: DrawnCard[]) => {
    setWalletError(false); // 다시 누름 = 다시 읽기 — 앞선 실패 줄을 지운다
    if (leavingRef.current) return; // 대화로 넘어가는 중엔 완료를 다시 눌러도(키보드 등) 지갑 조회를 또 내보내지 않는다
    setPendingDrawn(drawn);
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    const here = window.location.pathname; // 이 판을 시작한 주소 — 응답 때 달라졌으면 떠나는 중이다
    void (async () => {
      const w = await fetchWallet("tarot_draw");
      checkingRef.current = false;
      // 떠나는 중이거나 떠났으면 대화로 끌고 가지 않는다(떠난 뒤 차감 방지) — 뒤로 가기는 주소가 먼저 바뀌고 화면 정리(aliveRef)는 한 박자 늦는다
      if (!aliveRef.current || window.location.pathname !== here) {
        setChecking(false); // 언마운트면 아무 일도 안 한다 · 화면이 보존돼도(Activity) "잠시만…" 이 남지 않게
        return;
      }
      // 못 읽었다(실패·5초 초과 — 계측은 fetchWallet 의 wallet_fetch_failed) → 팝업·paywall_shown·이동 없이 '다시 눌러줘'.
      // 예전엔 잔액 0(parseWallet(null))으로 잔액 부족 팝업을 띄워, 별이 있는 유저를 충전으로 밀고 가짜 AddToCart 를 쐈다(사용자 결정 2026-10-09 B)
      if (!w) {
        setChecking(false);
        setWalletError(true);
        return;
      }
      // 로그인 전 맛보기 — 새 흐름 그룹 비로그인
      if (isNewFlowGuest(w)) {
        setChecking(false);
        const price = tarotPrice(spreadType, w.menuArm);
        savePendingDraw(localStorage, selection, drawn);
        setGuestPrice(price);
        setSheetPriceText(guestSheetLine(price, w.menuArm));
        setGuestMode(true);
        if (revealed) {
          // 이미 공개된 판(복원) — 바로 창
          openSheet(loginFailed ? "fail" : "auto", price);
        } else {
          // 새로 뽑은 판 — 공개 애니메이션이 끝나면 CardReveal 이 onRevealed 로 창을 올린다
          autoRanRef.current = true;
          setRevealed(drawn);
          trackUiEvent("cards_revealed", { meta: { spread: spreadType, count: drawn.length } });
        }
        return;
      }
      const price = tarotPrice(spreadType, w.menuArm);
      // 팝업 생략은 메뉴판 그룹만 — 남은 동의 선택(같은 탭에서 옛 그룹 계정으로 바꿈 · 스위치를 'legacy' 로 돌림)이어도 옛 그룹은 늘 확인 팝업
      if (selection.consented && w.menuArm === "menu" && w.balance >= price) {
        goToReading(drawn, price); // 동의 소모는 goToReading 안에서 · 안내(checking)는 화면이 넘어갈 때까지 켜 둔다
        return;
      }
      setChecking(false);
      setCost(price);
      setBalance(w.balance);
      // 다시 온 회원 — 로그인 전 맛보기에서 '가입 선물'을 보고 왔는데 선물이 없다(카카오 계정당 1회) → 팝업에 한 줄(스펙 §4)
      const via = resumeRef.current;
      const short = price - w.balance;
      const returning = (via === "login" || via === "home") && !w.giftUnused && short > 0;
      setReturningShort(returning ? short : null);
      if (returning) trackUiEvent("returning_short_shown", { meta: { short } });
      setShowConfirm(true);
    })();
  };

  // 공개 애니메이션이 끝났다 — 새로 뽑은 판(비로그인)은 로그인 창, 복원한 판은 '뽑은 뒤' 단계를 이어간다(버튼 없이, 한 번만 — 스펙 §3 ⑤)
  const onRevealed = () => {
    if (guestMode) {
      openSheet(loginFailed ? "fail" : "auto", guestPrice ?? 0);
      return;
    }
    if (autoRanRef.current || !revealed) return;
    autoRanRef.current = true;
    onDrawn(revealed);
  };

  // 처음부터 다시 뽑기 — 저장한 판을 버리고 의식으로
  const restart = () => {
    clearPendingDraw(localStorage);
    setRevealed(null);
    setGuestMode(false);
    setSheetOpen(false);
    setLoginFailed(false); // 버린 판의 로그인 실패 표시가 새로 뽑은 판의 창에 남지 않게
    setPendingDrawn(null);
    setReturningShort(null);
  };

  // 충전하러 간다 — 새 장치가 켜졌으면 진행을 저장해 결제 뒤 다시 뽑지 않게(스위치 'old' 동안엔 지금 prod 그대로)
  const openRecharge = () => {
    if (featuresOn && pendingDrawn) savePendingDraw(localStorage, selection, pendingDrawn);
    setRechargeSheetOpen(true);
  };

  return (
    <main className="flex flex-1 flex-col items-center w-full">
      {/* 단계 인디케이터 */}
      <div className="mt-14 mb-8">
        <ProgressSteps current={3} />
      </div>

      {revealed ? (
        <div className="w-full max-w-md mx-auto px-5 pb-16 flex flex-col items-center">
          <CardReveal drawn={revealed} accent={accent} onRevealed={onRevealed} />
          {/* 창·팝업을 닫았을 때 다시 잇는 버튼 */}
          {!sheetOpen && !showConfirm && !rechargeSheetOpen && !checking && (
            <div className="w-full mt-8 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => (guestMode ? openSheet("reopen", guestPrice ?? 0) : onDrawn(revealed))}
                className="w-full py-3.5 rounded-xl text-white font-bold text-[15px] active:scale-[0.98] transition"
                style={{ background: accent, boxShadow: `0 6px 18px ${accent}55` }}
              >
                {guestMode ? "로그인하고 풀이 보기" : "이 카드로 풀이 시작하기"}
              </button>
              <button type="button" onClick={restart} className="text-[12px] text-text-light/80 underline">
                처음부터 다시 뽑기
              </button>
            </div>
          )}
        </div>
      ) : (
        <CardDrawRitual
          cardCount={cardCount}
          slotLabels={labels}
          accent={accent}
          ritualLabel={info.label}
          completeLabel="고민 상담 시작하기"
          relationshipLayout={spreadType === "relationship_5"}
          backLabel="리딩 방법 선택"
          onBack={() => router.push("/tarot")}
          onComplete={onDrawn}
        />
      )}

      {showConfirm && cost !== null && (
        <StarConfirmModal
          spreadLabel={info.label}
          cost={cost}
          balance={balance}
          loading={false}
          accent={accent}
          surface={RECHARGE_SOURCE.tarotDraw}
          extra={
            returningShort !== null ? (
              <p className="mb-4 rounded-2xl bg-lilac-soft/50 px-4 py-3 text-center text-[12.5px] font-bold leading-relaxed text-eye-purple">
                다시 와줘서 반가워! 가입 선물은 처음 한 번뿐이라
                <br />
                별 {returningShort}개가 더 필요해
              </p>
            ) : undefined
          }
          onConfirm={() => {
            if (pendingDrawn) goToReading(pendingDrawn, cost); // 팝업이 보여 준 가격 그대로
          }}
          onCharge={openRecharge}
          onClose={() => setShowConfirm(false)}
        />
      )}
      {/* 🔴 닫혀 있으면 마운트하지 않는다 — 시트는 useTossPayment 를 호출해서
          마운트만으로 /api/auth/me + 토스 SDK 초기화가 돈다. 상시 마운트하면
          공개 지면(사주 운세 설명 20개 등) 방문자 전원에게 그 비용이 걸린다. */}
      {rechargeSheetOpen && cost !== null && (
        <RechargeSheet
          open
          returnTo={featuresOn ? resumeHref("payment") : "/tarot/draw"}
          need={cost}
          balance={balance}
          source={RECHARGE_SOURCE.tarotDraw}
          onClose={() => setRechargeSheetOpen(false)}
        />
      )}
      {sheetOpen && (
        <LoginSheet
          concern={selection.concern}
          priceText={sheetPriceText}
          kakaoHref={`/api/auth/login/kakao?next=${encodeURIComponent(resumeHref("login"))}`}
          failed={loginFailed}
          spread={spreadType}
          onDismiss={() => setSheetOpen(false)}
        />
      )}
      {/* fixed 덮개라 이 <main>(또는 조상)에 transform 이 남는 애니메이션(예: animate-fade-in)을 붙이면 fixed 의 기준이 화면이 아니라 그 요소가 돼 깨진다 — StarConfirmModal 이 포털을 쓰는 이유와 같다 */}
      {checking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="status"
          aria-live="polite"
        >
          <p className="px-4 py-2 rounded-full bg-white/90 text-text-light text-sm shadow-[0_4px_18px_rgba(90,62,140,0.15)]">
            잠시만…
          </p>
        </div>
      )}
      {/* 잔액 조회 실패 한 줄 — 탭을 막지 않는다(pointer-events-none) · 완료 버튼을 다시 누르면 사라지고 다시 읽는다 */}
      {walletError && (
        <div role="alert" className="fixed inset-x-0 bottom-36 z-50 flex justify-center px-4 pointer-events-none">
          <p className="rounded-full bg-white/95 px-4 py-2 text-[13px] font-bold text-eye-purple shadow-[0_4px_18px_rgba(90,62,140,0.15)]">
            잔액을 못 불러왔어 — 다시 눌러줘
          </p>
        </div>
      )}
      {/* 가입 선물 토스트 — 막지 않는다 */}
      {welcomeToast && (
        <div role="status" className="fixed inset-x-0 top-20 z-50 flex justify-center px-4 pointer-events-none">
          <p className="rounded-full bg-gold-soft px-4 py-2 text-[13px] font-bold text-eye-purple shadow-[0_4px_18px_rgba(232,194,106,0.35)]">
            🎁 가입 선물 별 {WELCOME_BONUS_STARS}개 받았어
          </p>
        </div>
      )}
    </main>
  );
}
