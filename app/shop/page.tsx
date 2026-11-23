"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  STAR_PACKAGES,
  FIRST_CHARGE_BONUS_RATE,
  type StarPackage,
} from "@/lib/constants";
import { fetchWallet } from "@/lib/wallet";
import { useStorePurchase } from "@/components/shop/useStorePurchase";
import TossPaymentBridge, { type TossPayment } from "@/components/shop/TossPaymentBridge";
import { IAP_NOTICE, iapResultNotice } from "@/lib/app-iap";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { appHaptic } from "@/lib/app-context";
import { safeInternalPath } from "@/lib/safe-internal-path";
import {
  pickDefaultPackage,
  parseNeedParam,
  firstChargeBonusPercent,
  packageSubLine,
} from "@/lib/recharge-default";
import { shopFailReason, shopReturnKind } from "@/lib/shop-return";

// ━━━━━━━━━━ 별 아이콘 (인라인 SVG) ━━━━━━━━━━
function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12 1.8 15.4 8.6 22.2 12 15.4 15.4 12 22.2 8.6 15.4 1.8 12 8.6 8.6Z"
        fill="#E8C26A"
        stroke="#D6A728"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 패키지별 마케팅 메타 (뱃지). 별당 가격·알뜰·보너스 줄은 lib/recharge-default 의 packageSubLine.
type BadgeTone = "gold" | "primary" | "rose";
type PackageMeta = {
  badge?: { label: string; tone: BadgeTone };
};
const PKG_META: Record<string, PackageMeta> = {
  star_10: {},
  star_30: {},
  star_70: { badge: { label: "추천", tone: "primary" } },
  star_150: {},
  star_300: {},
};

const SHOP_PKG_IDS = STAR_PACKAGES.map((p) => p.id);

/** 브라우저(토스) 가격 표기 */
const wonPrice = (pkg: StarPackage) => `${pkg.price.toLocaleString()}원`;

/** 결제 버튼 글 — 가격 표기만 경로마다 다르다(브라우저 = 우리 원화 / 앱 = 스토어 가격 문자열) */
function payLabel(pkg: StarPackage, firstChargeEligible: boolean, price: string): string {
  return firstChargeEligible
    ? `${pkg.stars + Math.round(pkg.stars * FIRST_CHARGE_BONUS_RATE)}별 받기 · ${price}`
    : `${pkg.stars}별 · ${price} 결제하기`;
}

function ShopContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const status = searchParams.get("status");
  const failCode = searchParams.get("code");
  const failMessage = searchParams.get("message");

  const paymentKey = searchParams.get("paymentKey");
  const orderId = searchParams.get("orderId");
  const amount = searchParams.get("amount");
  // 잔액 부족 모달에서 넘어온 "하려는 것의 가격" — 있으면 부족분 맞춤 기본 선택(lib/recharge-default)
  const need = parseNeedParam(searchParams.get("need"));

  const [balance, setBalance] = useState<number | null>(null);
  const [firstChargeEligible, setFirstChargeEligible] = useState(false);
  const [eligibilityLoaded, setEligibilityLoaded] = useState(false);
  // 직접 고른 뒤엔 늦게 온 잔액/자격 응답으로 덮어쓰지 않는다
  const userPickedRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string>("star_70");
  const [loading, setLoading] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [confirmTone, setConfirmTone] = useState<"progress" | "success" | "fail">(
    "progress"
  );

  // 토스 결제창 (Payment Window) 상태
  const [userId, setUserId] = useState<string | null>(null);
  // 토스 결제 상태 — 브라우저에서만 붙는 TossPaymentBridge 가 채운다(앱 안에선 늘 null, 토스 SDK 가 안 뜬다)
  const [toss, setToss] = useState<TossPayment | null>(null);
  const paymentReady = toss?.paymentReady ?? false;
  const paymentError = toss?.paymentError ?? null;
  // 앱 안 = 스토어 결제(스펙 2026-11-23-앱-결제 §5). 앱 안에선 토스 결제창·토스 안내를 그리지 않는다(애플 3.1.1)
  const store = useStorePurchase(SHOP_PKG_IDS);
  const storePath = store.channel === "store" || store.channel === "update";
  const [storeNotice, setStoreNotice] = useState<string | null>(null);

  // 결제 완료 후 뒤로가기 인터셉트용 sentinel 추적
  const sentinelPushedRef = useRef(false);

  // 별 잔액 조회
  const fetchBalance = useCallback(() => {
    // 잔액을 읽는다(lib/wallet — 실패는 wallet_fetch_failed 로 계측). 못 읽으면 잔액 0
    void fetchWallet("shop").then((w) => {
      setBalance(w ? w.balance : 0);
    });
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // 결제 퍼널 — 샵 진입(결제 복귀 리다이렉트 paymentKey/status 는 제외). 1회만.
  const shopOpenedRef = useRef(false);
  useEffect(() => {
    if (shopOpenedRef.current || paymentKey || status) return;
    shopOpenedRef.current = true;
    trackUiEvent("recharge_sheet_opened", { meta: { source: "shop", need } });
  }, [paymentKey, status]);

  // 첫 충전 보너스 자격 조회 — 자격 있을 때만 배너/보너스 표기 (서버가 권위)
  useEffect(() => {
    fetch("/api/stars/first-charge-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFirstChargeEligible(!!d?.eligible))
      .catch(() => {})
      .finally(() => setEligibilityLoaded(true));
  }, []);

  // ?need= 가 있으면 잔액·자격이 정해진 뒤 한 번 기본 선택을 맞춘다. 없으면 star_70 그대로.
  useEffect(() => {
    if (need == null || !eligibilityLoaded || balance === null || userPickedRef.current) return;
    const picked = pickDefaultPackage({
      need,
      balance,
      bonusEligible: firstChargeEligible,
      packages: STAR_PACKAGES,
    });
    if (picked) setSelectedId(picked);
  }, [need, eligibilityLoaded, balance, firstChargeEligible]);

  // 로그인 확인 + userId 확보 (리다이렉트 가드)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.isAuthenticated && data.user?.id) {
          setUserId(data.user.id);
        } else {
          router.replace(`/login?next=${encodeURIComponent("/shop")}`);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  // 성공 리다이렉트 쿼리(paymentKey 등)는 1회 캡처 — 결제창 방식은 전체 리다이렉트라
  // /shop?paymentKey=... 가 히스토리에 실제 엔트리로 남고, 뒤로가기/재방문 시
  // confirm 이 재실행되며 "이미 처리된 결제" 화면이 반복됨 → 캡처 후 URL에서 즉시 제거
  const pendingConfirmRef = useRef<{
    paymentKey: string;
    orderId: string;
    amount: number;
  } | null>(null);
  if (paymentKey && orderId && amount && !pendingConfirmRef.current) {
    pendingConfirmRef.current = { paymentKey, orderId, amount: Number(amount) };
  }
  const confirmStartedRef = useRef(false);

  // 충전 완료 화면 — 토스 승인(아래 confirmPayment)과 앱 스토어 결제가 같이 쓴다
  const finishCharge = useCallback(
    (data: { stars: number; bonusStars: number; alreadyProcessed?: boolean }) => {
      setConfirmTone("success");
      appHaptic("success"); // 충전 완료(이미 처리된 결제여도 사용자가 보는 건 완료 화면) — 앱 caps ui, 스펙 §5 ⑥
      setConfirmMessage(
        data.alreadyProcessed
          ? "이미 처리된 결제야"
          : data.bonusStars > 0
          ? `${data.stars}별 + 보너스 ${data.bonusStars}별 = ${
              data.stars + data.bonusStars
            }별 충전 완료!`
          : `${data.stars}별 충전 완료!`
      );
      fetchBalance();
      // 헤더 잔액 칩도 같은 이벤트로 갱신 (Header 가 listen)
      window.dispatchEvent(new Event("byeolkong:balance-updated"));

      // returnTo 쿼리 있으면 — 검증 후 대화로 복귀 (토스트 없이)
      const validReturnTo = safeInternalPath(searchParams.get("returnTo"));
      if (validReturnTo && !data.alreadyProcessed) {
        setTimeout(() => router.replace(validReturnTo), 1200);
      } else {
        setTimeout(() => router.replace("/shop?status=success"), 1500);
      }
    },
    [router, fetchBalance, searchParams]
  );

  // 결제 승인 처리 (successUrl redirect 후)
  const confirmPayment = useCallback(async () => {
    const pending = pendingConfirmRef.current;
    if (!pending) return;
    setLoading(true);
    setConfirmTone("progress");
    setConfirmMessage("결제 승인 중...");

    try {
      const res = await fetch("/api/payment/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending),
      });

      if (res.ok) {
        finishCharge(await res.json());
      } else {
        const data = await res.json().catch(() => ({}));
        setConfirmTone("fail");
        const baseMsg = data.error || "알 수 없는 오류";
        setConfirmMessage(
          // 제목('앗, 결제가 안 됐어')은 패널이 붙인다 — 여기엔 이유만(디자인 다듬기 상점 ⑧ 가)
          data.refunded ? `${baseMsg} (자동 환불됨)` : baseMsg
        );
      }
    } catch {
      setConfirmTone("fail");
      setConfirmMessage("결제 승인 중 오류가 발생했어");
    } finally {
      setLoading(false);
    }
  }, [finishCharge]);

  useEffect(() => {
    if (!pendingConfirmRef.current || confirmStartedRef.current) return;
    confirmStartedRef.current = true;
    // 결제 파라미터를 히스토리에서 즉시 제거 — 이 엔트리로 되돌아와도 재승인 안 됨
    window.history.replaceState(null, "", "/shop");
    confirmPayment();
  }, [confirmPayment]);

  // 결제 완료(성공) 상태로 진입하면 뒤로가기 시 토스 결제창으로 안 가고 /shop 으로 직행하도록 인터셉트
  useEffect(() => {
    const isPostPaymentSuccess =
      confirmTone === "success" || status === "success";
    if (!isPostPaymentSuccess || sentinelPushedRef.current) return;

    sentinelPushedRef.current = true;
    window.history.pushState({ byeolkongShopSentinel: true }, "");

    const onPop = () => {
      router.replace("/shop");
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [confirmTone, status, router]);

  const selectedPkg = STAR_PACKAGES.find((p) => p.id === selectedId);
  const isProcessing = !!confirmMessage;

  const handlePay = async () => {
    if (!selectedPkg || !toss) return;
    setLoading(true);
    trackUiEvent("recharge_payment_started", {
      meta: { source: "shop", packageId: selectedPkg.id, amountWon: selectedPkg.price },
    });
    try {
      await toss.startPayment(selectedPkg);
      // requestPayment 는 결제창으로 전체 페이지 전환 — 이 이후는 실행 안 됨
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === "USER_CANCEL" || err.code === "STOP") {
        return;
      }
      alert(err.message ?? "결제 중 오류가 발생했어. 다시 시도해줘!");
    } finally {
      setLoading(false);
    }
  };

  // 앱 안 스토어 결제 — 성공은 토스와 같은 완료 화면, 취소는 말 없이, 대기·실패는 안내 한 줄
  const handleStoreBuy = async () => {
    if (!selectedPkg || !store.inApp) return;
    setStoreNotice(null);
    trackUiEvent("recharge_payment_started", {
      meta: { source: "shop", packageId: selectedPkg.id, amountWon: selectedPkg.price, via: "iap" },
    });
    const r = await store.buy(selectedPkg.id);
    if (r.ok) finishCharge(r);
    else setStoreNotice(iapResultNotice(r));
  };
  const storeLine =
    store.channel === "update"
      ? IAP_NOTICE.update
      : store.channel === "store" && store.pricesFailed
      ? IAP_NOTICE.pricesUnavailable
      : storePath
      ? storeNotice
      : null;
  const priceText = (pkg: StarPackage) => (storePath ? store.prices?.[pkg.id] ?? "…" : wonPrice(pkg));

  return (
    <main className="flex-1 w-full">
      {/* 토스 준비(브라우저 전용, 그림 없음) — 화면 수명 동안 붙여 둔다(예전처럼 결제 진행 패널 동안에도) */}
      {store.channel === "toss" && <TossPaymentBridge onChange={setToss} />}
      <div className="max-w-md mx-auto px-5 pt-4 pb-24 animate-fade-in">
        {/* 뒤로가기 — 결제 직후엔 토스 결제창이 history에 있어서 router.back 위험 → 홈으로 직행.
            앱에선 숨긴다(web-only) — 상점은 하단 탭이라 앱 머리에 '별콩 상점'이 있고 뒤로 갈 곳이 없다(디자인 다듬기 상점 ① H1, 운영자 11-21) */}
        <button
          onClick={() => {
            if (
              confirmTone === "success" ||
              status === "success" ||
              status === "fail" ||
              pendingConfirmRef.current
            ) {
              router.replace("/");
            } else {
              router.back();
            }
          }}
          aria-label="뒤로 가기"
          className="web-only inline-flex items-center gap-1 text-11 font-medium text-text-light hover:text-accent transition-colors mb-2"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="11.5 3 5 9 11.5 15" />
          </svg>
          <span>뒤로</span>
        </button>

        {/* 현재 별 잔액 — 옛 머리말(큰 별콩이 그림 · 큰 제목 '별 충전소' · 설명)을 이 카드 하나로 접었다.
            제목은 앱 머리 '별콩 상점'과 두 번이었고, 머리말이 화면 절반이라 추천 칸이 결제 버튼에 가렸다(디자인 다듬기 상점 ①② H1) */}
        <BalanceCard balance={balance} firstCharge={firstChargeEligible} />

        {/* 결제 진행/결과 패널 — confirmMessage가 있을 때만 노출, 패키지/결제버튼 대체 */}
        {isProcessing ? (
          <PaymentStatusPanel
            message={confirmMessage}
            tone={confirmTone}
            onRetry={() => {
              setConfirmMessage(null);
              router.replace("/shop");
            }}
          />
        ) : (
          <>
            {/* 결제창에서 돌아온 결과 — 흰 카드 하나(디자인 다듬기 상점 ⑥ 가, 운영자 11-21).
                예전 초록·빨강·갈색 띠 + 개발 코드('code: …') + 밑줄 링크를 별콩이 말투 · 연보라 한 모양으로.
                오류 코드는 보여 주지 않는다(운영자 '코드 같은 건 빼버리자'). 토스가 준 이유 글은 그대로 둔다 */}
            {(() => {
              const kind = shopReturnKind(status, failCode);
              if (kind === "success")
                return <ReturnCard icon={<StarIcon className="w-6 h-6" />} title="별이 들어왔어!" sub="이제 별콩이랑 이어서 얘기하자" />;
              const validReturnTo = safeInternalPath(searchParams.get("returnTo"));
              const backToChat = validReturnTo && (
                <button
                  type="button"
                  onClick={() => router.replace(validReturnTo)}
                  className="mt-3 btn btn-secondary btn-md"
                >
                  하던 대화로 돌아가기
                </button>
              );
              if (kind === "cancel")
                return (
                  <ReturnCard icon={<span className="text-17 font-black">‖</span>} title="결제를 멈췄어" sub="마음 바뀌면 언제든 다시 골라줘">
                    {backToChat}
                  </ReturnCard>
                );
              if (kind === "fail") {
                return (
                  <ReturnCard
                    icon={<span className="text-20 font-black">!</span>}
                    title="앗, 결제가 안 됐어"
                    sub={shopFailReason(failCode, failMessage)}
                  >
                    {backToChat}
                  </ReturnCard>
                );
              }
              return null;
            })()}

            {/* 패키지 섹션 */}
            {/* 다른 화면과 같은 소제목(왼쪽 굵게) — 옛 가운데 줄 + 넓은 자간 '패키지 고르기'(상점 ③) */}
            <h2 className="text-15 font-bold text-eye-purple mt-6 mb-3">얼마나 충전할까?</h2>

            <div className="flex flex-col gap-2.5">
              {STAR_PACKAGES.map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  selected={selectedId === pkg.id}
                  onSelect={() => {
                    userPickedRef.current = true;
                    setSelectedId(pkg.id);
                    trackUiEvent("recharge_package_selected", {
                      meta: { source: "shop", packageId: pkg.id },
                    });
                  }}
                  disabled={loading || !!store.busyId}
                  showBonus={firstChargeEligible}
                  priceText={priceText(pkg)}
                  storePrice={storePath}
                />
              ))}
            </div>

            {/* 결제창 SDK 로드 실패 시 */}
            {paymentError && (
              <Banner tone="fail">
                결제 모듈을 불러오지 못했어. 새로고침해줘.
              </Banner>
            )}

            {/* 앱 안 결제 안내(업데이트 필요·가격 못 받음·승인 대기·실패) — 웹 결제를 가리키지 않는다 */}
            {storeLine && (
              <p className="mt-3 text-12 text-text-light text-center leading-relaxed break-keep">{storeLine}</p>
            )}

            {/* 안내 카피 — 반말 세 줄 · 12(디자인 다듬기 상점 ⑦ N1, 운영자 11-21). 이용 기간(1년)·환불 정책 링크는 고지라 꼭 둔다 */}
            <div className="card mt-5">
              <p className="text-13 font-bold text-eye-purple mb-2">
                결제 안내
              </p>
              <ul className="space-y-1.5 text-12 text-text-light leading-relaxed break-keep">
                <li className="web-only">· 토스페이먼츠로 안전하게 결제돼(카드·토스페이·계좌이체)</li>
                <li>
                  · 충전한 별은{" "}
                  <Link
                    href="/refund"
                    className="underline underline-offset-2 hover:text-accent"
                  >
                    환불 정책
                  </Link>
                  을 따라
                </li>
                <li>· 충전한 별은 최대 1년 동안 쓸 수 있어</li>
              </ul>
            </div>
          </>
        )}
      </div>

      {/* 하단 sticky 결제 버튼 — BottomTab(h-16) 위로 띄움 */}
      {!isProcessing && selectedPkg && (
        <div
          className="fixed inset-x-0 z-40 pointer-events-none"
          style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
        >
          <div className="max-w-md mx-auto px-5 pb-3 pt-3 pointer-events-auto">
            {store.channel === "toss" && (
              <button
                onClick={handlePay}
                disabled={loading || !paymentReady}
                className="btn btn-primary btn-lg"
              >
                <StarIcon className="w-[18px] h-[18px] drop-shadow-[0_1px_0_rgba(0,0,0,0.15)]" />
                <span className="tabular-nums">
                  {!paymentReady && !paymentError
                    ? "잠시만, 결제 준비 중..."
                    : payLabel(selectedPkg, firstChargeEligible, wonPrice(selectedPkg))}
                </span>
              </button>
            )}
            {/* 하이드레이션 첫 그림(pending)은 토스 준비 중과 같은 모양 · 앱은 스토어 가격을 받고 로그인이 확인돼야 누를 수 있다 */}
            {store.channel !== "toss" && (
              <button
                onClick={() => void handleStoreBuy()}
                disabled={
                  loading ||
                  !store.inApp ||
                  !store.prices?.[selectedPkg.id] ||
                  store.signedIn !== true ||
                  !!store.busyId
                }
                className="btn btn-primary btn-lg"
              >
                <StarIcon className="w-[18px] h-[18px] drop-shadow-[0_1px_0_rgba(0,0,0,0.15)]" />
                <span className="tabular-nums">
                  {store.channel === "pending"
                    ? "잠시만, 결제 준비 중..."
                    : payLabel(selectedPkg, firstChargeEligible, priceText(selectedPkg))}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

// ━━━━━━━━━━ 별 잔액 카드 ━━━━━━━━━━

function BalanceCard({ balance, firstCharge }: { balance: number | null; firstCharge: boolean }) {
  return (
    <div className="relative overflow-hidden p-4 rounded-2xl bg-[#FFF6E3]">
      {/* 배경 별 데코 */}
      <div className="absolute -right-3 -top-3 opacity-25 rotate-12 pointer-events-none">
        <StarIcon className="w-16 h-16" />
      </div>
      <div className="absolute right-8 top-8 opacity-20 -rotate-12 pointer-events-none">
        <StarIcon className="w-7 h-7" />
      </div>

      <div className="relative flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-card shrink-0 overflow-hidden">
          <Image src="/byeolkong-shop.png" alt="별콩이" width={52} height={52} priority className="object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-11 font-bold text-[#7A5A1F] tracking-wide">
            지금 가진 별
          </p>
          {balance === null ? (
            <span
              className="inline-block mt-1 w-12 h-6 rounded-lg bg-[#7A5A1F]/12 animate-pulse"
              aria-label="잔액 불러오는 중"
            />
          ) : (
            <p className="text-22 font-black text-eye-purple tabular-nums leading-tight animate-fade-in">
              {balance}
              <span className="text-13 font-bold text-text-light ml-1">
                별
              </span>
            </p>
          )}
          <p className="text-12 text-[#9A7B3F] mt-0.5 leading-snug break-keep">
            별이 있어야 별콩이랑 더 깊은 얘기 나눌 수 있어
          </p>
        </div>
      </div>

      {/* 첫 충전 보너스 — 자격 있을 때만. 옛 따로 선 노란 배너(빈 동그라미 · '드려요')를 이 카드 아랫줄로 붙였다
          (디자인 다듬기 상점 ⑤ V2, 운영자 11-21). 칸마다 붙던 '+20%' 알약도 뺐다 — 칸엔 보너스 줄 하나 */}
      {firstCharge && (
        <div className="relative mt-3 pt-3 flex items-center gap-2 border-t border-dashed border-[#7A5A1F]/25">
          <StarIcon className="w-[18px] h-[18px] shrink-0" />
          <p className="flex-1 min-w-0 text-13 font-bold text-[#7A5A1F] break-keep">
            첫 충전이면 별 +{firstChargeBonusPercent()}% 더 · 딱 한 번
          </p>
          <span className="shrink-0 px-2 py-0.5 rounded-full text-11 font-black bg-white text-[#7A5A1F] shadow-card">
            첫 충전
          </span>
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━ 패키지 카드 ━━━━━━━━━━

function PackageCard({
  pkg,
  selected,
  onSelect,
  disabled,
  showBonus,
  priceText,
  storePrice,
}: {
  pkg: StarPackage;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  showBonus?: boolean;
  /** 브라우저 = 'N원' · 앱 = 스토어 가격 문자열(받기 전 '…') */
  priceText: string;
  /** 앱 안(스토어 가격) — 우리 원화로 계산한 '별당' 줄은 숨긴다(보너스 줄은 그대로) */
  storePrice?: boolean;
}) {
  const meta = PKG_META[pkg.id] ?? {};
  const sub = packageSubLine(pkg, !!showBonus, !!storePrice);

  // 디자인 다듬기 상점 ④ A(운영자 11-21): 다섯 칸이 똑같던 큰 별 그림·추천 금색 점·초록 '% 더 알뜰' 알약·'+20%' 알약을 빼고
  // '별 수 + 아랫줄 하나 | 가격 · 체크' 로. 칸 높이가 다 같아져 다섯 칸이 첫 화면에 거의 다 든다.
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`relative w-full flex items-center gap-3 card transition-all disabled:opacity-50 active:scale-[0.99] text-left ${
        selected
          ? "outline-2 outline-accent -outline-offset-2"
          : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-17 font-black text-eye-purple tabular-nums leading-none">
            {pkg.stars}
            <span className="text-12 font-bold text-text-light ml-0.5">
              별
            </span>
          </p>
          {meta.badge && (
            <InlineBadge tone={meta.badge.tone}>{meta.badge.label}</InlineBadge>
          )}
        </div>
        {sub && (
          <p
            className={`mt-1 text-12 tabular-nums ${
              sub.tone === "bonus" ? "font-bold text-accent" : "text-text-light"
            }`}
          >
            {sub.text}
          </p>
        )}
      </div>

      <p className="shrink-0 text-15 font-bold text-eye-purple tabular-nums">
        {priceText}
      </p>

      {/* 우측 체크 */}
      <span
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
          selected
            ? "bg-lilac-deep shadow-card"
            : "bg-cream border-2 border-lilac-mid/40"
        }`}
        aria-hidden
      >
        {selected && (
          <svg
            width="11"
            height="11"
            viewBox="0 0 12 12"
            fill="none"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="2.5 6.5 5 9 9.5 3.5" />
          </svg>
        )}
      </span>
    </button>
  );
}

// ━━━━━━━━━━ 인라인 뱃지 ━━━━━━━━━━

function InlineBadge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: React.ReactNode;
}) {
  const cls =
    tone === "gold"
      ? "bg-gold-wash text-eye-purple"
      : tone === "primary"
      ? "bg-lilac-deep text-white"
      : "bg-rose-400 text-white";
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-11 font-black tracking-wide whitespace-nowrap shadow-card ${cls}`}
    >
      {children}
    </span>
  );
}

// ━━━━━━━━━━ 결제 진행/결과 패널 ━━━━━━━━━━

function PaymentStatusPanel({
  message,
  tone,
  onRetry,
}: {
  message: string | null;
  tone: "progress" | "success" | "fail";
  onRetry: () => void;
}) {
  return (
    <div className="card-report mt-5 text-center">
      <div
        className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-3"
        style={{
          background:
            tone === "success"
              ? "#FFF6E3"
              : "rgba(159,138,208,0.12)",
        }}
      >
        {tone === "progress" && <SpinnerDots />}
        {tone === "success" && (
          <StarIcon className="w-9 h-9" />
        )}
        {/* 실패 = 결과 카드와 같은 연보라 '!'(디자인 다듬기 상점 ⑧ 가) — 예전엔 이모지를 지운 빈 분홍 동그라미 + 빨간 글 */}
        {tone === "fail" && (
          <span className="text-28 font-black text-accent" aria-hidden>
            !
          </span>
        )}
      </div>
      <p className="text-15 font-bold leading-tight text-eye-purple">
        {tone === "fail" ? "앗, 결제가 안 됐어" : message}
      </p>
      {tone === "fail" && message && (
        <p className="text-12 text-text-light mt-1 break-keep">{message}</p>
      )}
      {tone === "progress" && (
        <p className="text-11 text-text-light mt-2">잠깐만, 마무리 중이야</p>
      )}
      {tone === "success" && (
        <p className="text-11 text-text-light mt-2">잔액 확인 후 이동할게</p>
      )}
      {tone === "fail" && (
        <button
          onClick={onRetry}
          className="btn btn-primary btn-md mt-4"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}

function SpinnerDots() {
  return (
    <span className="inline-flex gap-1">
      <span className="w-2 h-2 rounded-full bg-lilac-deep animate-pulse" />
      <span
        className="w-2 h-2 rounded-full bg-lilac-deep animate-pulse"
        style={{ animationDelay: "0.15s" }}
      />
      <span
        className="w-2 h-2 rounded-full bg-lilac-deep animate-pulse"
        style={{ animationDelay: "0.3s" }}
      />
    </span>
  );
}

// ━━━━━━━━━━ 결제창에서 돌아온 결과 카드 ━━━━━━━━━━

function ReturnCard({
  icon,
  title,
  sub,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card mt-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-lilac-soft/60 text-accent flex items-center justify-center shrink-0" aria-hidden>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-15 font-bold text-eye-purple leading-snug">{title}</p>
          <p className="text-12 text-text-light mt-0.5 leading-snug break-keep">{sub}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// ━━━━━━━━━━ 배너 ━━━━━━━━━━

// 결제창 모듈을 못 불러올 때만 남은 띠(결제 결과는 ReturnCard 로 옮겼다 — 상점 ⑥)
function Banner({
  tone,
  children,
}: {
  tone: "fail";
  children: React.ReactNode;
}) {
  const cls = tone === "fail" ? "bg-rose-100 text-rose-500" : "";
  return (
    <div className={`mt-3 p-3 rounded-xl text-12 text-center font-bold ${cls}`}>
      {children}
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center px-5">
          <p className="text-text-light text-14">별 충전소 준비 중…</p>
        </main>
      }
    >
      <ShopContent />
    </Suspense>
  );
}
