"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { STAR_PACKAGES, type StarPackage } from "@/lib/constants";
import {
  loadTossPayments,
  type TossPaymentsWidgets,
} from "@tosspayments/tosspayments-sdk";

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!;

// ━━━━━━━━━━ 별 아이콘 (인라인 SVG) ━━━━━━━━━━
function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12 2.5l2.9 6.05 6.6.62-4.98 4.4 1.46 6.48L12 17.1l-5.98 3.45 1.46-6.48L2.5 9.67l6.6-.62L12 2.5z"
        fill="#E8C26A"
        stroke="#D6A728"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 패키지별 마케팅 메타 (뱃지/하이라이트). 별당 가격은 자동 계산.
type BadgeTone = "gold" | "primary" | "rose";
type PackageMeta = {
  badge?: { label: string; tone: BadgeTone };
  highlight?: boolean;
};
const PKG_META: Record<string, PackageMeta> = {
  star_10: {},
  star_30: {},
  star_70: { badge: { label: "추천", tone: "primary" }, highlight: true },
  star_150: {},
  star_300: {},
};

const BASE_PER_STAR = STAR_PACKAGES[0].price / STAR_PACKAGES[0].stars; // 10별 1000원 = 100원/별

function ShopContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const status = searchParams.get("status");
  const failCode = searchParams.get("code");
  const failMessage = searchParams.get("message");

  const paymentKey = searchParams.get("paymentKey");
  const orderId = searchParams.get("orderId");
  const amount = searchParams.get("amount");

  const [balance, setBalance] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string>("star_70");
  const [loading, setLoading] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [confirmTone, setConfirmTone] = useState<"progress" | "success" | "fail">(
    "progress"
  );

  // 결제위젯 (Toss Payment Widget) 상태
  const [userId, setUserId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);

  // 결제 완료 후 뒤로가기 인터셉트용 sentinel 추적
  const sentinelPushedRef = useRef(false);

  // 별 잔액 조회
  const fetchBalance = useCallback(() => {
    fetch("/api/stars/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBalance(typeof d?.balance === "number" ? d.balance : 0))
      .catch(() => setBalance(0));
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // 로그인 확인 + userId 확보 (위젯 customerKey 로 사용)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.isAuthenticated && data.user?.id) {
          setUserId(data.user.id);
          setCustomerName(data.user.nickname ?? null);
        } else {
          router.replace(`/login?next=${encodeURIComponent("/shop")}`);
        }
      })
      .catch(() => {
        if (!cancelled) setWidgetError("auth_check_failed");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // 결제 승인 처리 (successUrl redirect 후)
  const confirmPayment = useCallback(async () => {
    if (!paymentKey || !orderId || !amount) return;
    setLoading(true);
    setConfirmTone("progress");
    setConfirmMessage("결제 승인 중...");

    try {
      const res = await fetch("/api/payment/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentKey,
          orderId,
          amount: Number(amount),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setConfirmTone("success");
        setConfirmMessage(
          data.alreadyProcessed
            ? "이미 처리된 결제야"
            : `${data.stars}별 충전 완료!`
        );
        fetchBalance();
        setTimeout(() => router.replace("/shop?status=success"), 1500);
      } else {
        const data = await res.json().catch(() => ({}));
        setConfirmTone("fail");
        const baseMsg = data.error || "알 수 없는 오류";
        setConfirmMessage(
          data.refunded ? `${baseMsg} (자동 환불됨)` : `결제 실패: ${baseMsg}`
        );
      }
    } catch {
      setConfirmTone("fail");
      setConfirmMessage("결제 승인 중 오류가 발생했어");
    } finally {
      setLoading(false);
    }
  }, [paymentKey, orderId, amount, router, fetchBalance]);

  useEffect(() => {
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

  // 위젯 SDK 1회 로드 (userId 확보 후 / 결제 결과 처리 중엔 스킵)
  useEffect(() => {
    if (!userId || isProcessing || widgetsRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
        if (cancelled) return;
        const w = tossPayments.widgets({ customerKey: userId });
        if (cancelled) return;
        widgetsRef.current = w;
        setWidgetReady(true);
      } catch (err) {
        console.error("Toss widget init failed", err);
        if (!cancelled) setWidgetError("widget_init_failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isProcessing]);

  const handlePay = async () => {
    if (!selectedPkg || !widgetsRef.current) return;
    setLoading(true);
    try {
      const readyRes = await fetch("/api/payment/ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageType: selectedPkg.id,
          stars: selectedPkg.stars,
          amount: selectedPkg.price,
        }),
      });

      if (!readyRes.ok) throw new Error("Payment ready failed");
      const readyData = await readyRes.json();

      const baseUrl = window.location.origin;

      // 결제창(모달) 방식 — requestPaymentWindow 호출 시 토스가 결제수단/약관/결제 모두 모달 안에서 처리
      await widgetsRef.current.requestPaymentWindow({
        amount: { value: readyData.amount, currency: "KRW" },
        orderId: readyData.orderId,
        orderName: readyData.orderName,
        successUrl: `${baseUrl}/shop`,
        failUrl: `${baseUrl}/shop?status=fail`,
        customerName: customerName ?? undefined,
      });
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

  return (
    <main className="flex-1 w-full">
      <div className="max-w-md mx-auto px-5 pt-3 pb-24 animate-fade-in">
        {/* 뒤로가기 — 결제 직후엔 토스 결제창이 history에 있어서 router.back 위험 → 홈으로 직행 */}
        <button
          onClick={() => {
            if (
              confirmTone === "success" ||
              status === "success" ||
              status === "fail" ||
              paymentKey
            ) {
              router.replace("/");
            } else {
              router.back();
            }
          }}
          aria-label="뒤로 가기"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-text-light/70 hover:text-lilac-deep transition-colors mb-2"
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

        <h1 className="font-display text-[28px] text-eye-purple text-center mb-1 tracking-wide">
          별 충전소
        </h1>
        <p className="text-[12px] text-text-light text-center mb-5">
          별이 있어야 별콩이랑 더 깊은 얘기 나눌 수 있어
        </p>

        {/* 현재 별 잔액 */}
        <BalanceCard balance={balance} />

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
            {/* 단순 status 배너 (success/fail/cancel) */}
            {status === "success" && (
              <Banner tone="success">충전 완료! 별이 추가됐어 ⭐</Banner>
            )}
            {status === "fail" && (
              <Banner tone="fail">
                {failMessage
                  ? `결제 실패: ${failMessage}`
                  : "결제에 실패했어. 다시 시도해볼래?"}
                {failCode && (
                  <span className="block mt-1 text-[10px] opacity-70 font-mono">
                    code: {failCode}
                  </span>
                )}
              </Banner>
            )}
            {status === "cancel" && <Banner tone="warn">결제가 취소됐어</Banner>}

            {/* 패키지 섹션 */}
            <SectionDivider label="패키지 고르기" />

            <div className="flex flex-col gap-2.5">
              {STAR_PACKAGES.map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  selected={selectedId === pkg.id}
                  onSelect={() => setSelectedId(pkg.id)}
                  disabled={loading}
                />
              ))}
            </div>

            {/* 위젯 SDK 로드 실패 시 */}
            {widgetError && (
              <Banner tone="fail">
                결제 모듈을 불러오지 못했어. 새로고침해줘.
              </Banner>
            )}

            {/* 안내 카피 */}
            <div className="mt-5 px-4 py-3.5 bg-cream-warm/60 rounded-2xl border border-lilac-mid/30">
              <p className="text-[11px] font-bold text-text-light tracking-wide mb-1.5">
                결제 안내
              </p>
              <ul className="space-y-1 text-[11px] text-text-light/80 leading-relaxed">
                <li>· 토스페이먼츠로 안전하게 결제됩니다</li>
                <li>· 카드, 토스페이, 계좌이체 등 다양한 수단 지원</li>
                <li>· 결제 버튼을 누르면 결제창이 열립니다</li>
                <li>
                  · 충전한 별은{" "}
                  <Link
                    href="/refund"
                    className="underline underline-offset-2 hover:text-lilac-deep"
                  >
                    환불 정책
                  </Link>
                  에 따라 처리됩니다
                </li>
                <li>· 위 상품의 최대 이용기간은 1년입니다</li>
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
            <button
              onClick={handlePay}
              disabled={loading || !widgetReady}
              className="w-full py-3.5 bg-lilac-deep text-white rounded-full text-[14px] font-bold shadow-lg hover:bg-lilac-deep/90 transition-all disabled:opacity-60 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <StarIcon className="w-[18px] h-[18px] drop-shadow-[0_1px_0_rgba(0,0,0,0.15)]" />
              <span className="tabular-nums">
                {!widgetReady && !widgetError
                  ? "잠시만, 결제 준비 중..."
                  : `${selectedPkg.stars}별 · ${selectedPkg.price.toLocaleString()}원 결제하기`}
              </span>
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ━━━━━━━━━━ 별 잔액 카드 ━━━━━━━━━━

function BalanceCard({ balance }: { balance: number | null }) {
  return (
    <div className="relative overflow-hidden p-4 rounded-2xl border border-gold-soft/40 bg-gradient-to-br from-[#FFF6E3] via-[#FDE9D4] to-[#FCDFCD] shadow-md flex items-center gap-3">
      {/* 배경 별 데코 */}
      <div className="absolute -right-3 -top-3 opacity-25 rotate-12 pointer-events-none">
        <StarIcon className="w-16 h-16" />
      </div>
      <div className="absolute right-8 top-8 opacity-20 -rotate-12 pointer-events-none">
        <StarIcon className="w-7 h-7" />
      </div>

      <div className="relative w-11 h-11 rounded-full bg-white/80 flex items-center justify-center shadow-sm shrink-0">
        <StarIcon className="w-7 h-7" />
      </div>
      <div className="relative flex-1 min-w-0">
        <p className="text-[11px] font-bold text-[#7A5A1F] tracking-wide">
          지금 가진 별
        </p>
        {balance === null ? (
          <span
            className="inline-block mt-1 w-12 h-6 rounded-md bg-[#7A5A1F]/12 animate-pulse"
            aria-label="잔액 불러오는 중"
          />
        ) : (
          <p className="text-[22px] font-black text-eye-purple tabular-nums leading-tight animate-fade-in">
            {balance}
            <span className="text-[13px] font-bold text-text-light/70 ml-1">
              별
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

// ━━━━━━━━━━ 패키지 카드 ━━━━━━━━━━

function PackageCard({
  pkg,
  selected,
  onSelect,
  disabled,
}: {
  pkg: StarPackage;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const meta = PKG_META[pkg.id] ?? {};
  const perStar = pkg.price / pkg.stars;
  const discountPct = Math.round((1 - perStar / BASE_PER_STAR) * 100);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`relative w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-white border-2 transition-all disabled:opacity-50 active:scale-[0.99] text-left ${
        selected
          ? "border-lilac-deep shadow-[0_0_0_3px_rgba(159,138,208,0.18)]"
          : "border-lilac-mid/30 hover:border-lilac/70"
      }`}
    >
      {/* 좌측 별 비주얼 */}
      <div className="relative shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FFF6E3] via-[#FDE9D4] to-[#FCDFCD] flex items-center justify-center">
        <StarIcon className="w-9 h-9 drop-shadow-[0_2px_3px_rgba(214,167,40,0.35)]" />
        {meta.highlight && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-gold animate-star-twinkle" />
        )}
      </div>

      {/* 중앙 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-[18px] font-black text-eye-purple tabular-nums leading-none">
            {pkg.stars}
            <span className="text-[12px] font-bold text-text-light/70 ml-0.5">
              별
            </span>
          </p>
          {meta.badge && (
            <InlineBadge tone={meta.badge.tone}>{meta.badge.label}</InlineBadge>
          )}
        </div>
        <p className="mt-1 text-[13px] font-bold text-eye-purple tabular-nums">
          {pkg.price.toLocaleString()}원
          <span className="text-[11px] font-medium text-text-light/70 ml-1.5">
            · 별당 {Math.round(perStar)}원
          </span>
        </p>
        {discountPct > 0 && (
          <span className="inline-block mt-1.5 text-[10px] font-black text-[#3F7A2F] bg-[#E5F4E0] px-2 py-0.5 rounded-full tabular-nums tracking-wide">
            {discountPct}% 더 알뜰
          </span>
        )}
      </div>

      {/* 우측 체크 */}
      <span
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
          selected
            ? "bg-lilac-deep shadow-sm"
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
      ? "bg-gradient-to-r from-gold-soft to-gold text-white"
      : tone === "primary"
      ? "bg-lilac-deep text-white"
      : "bg-rose-400 text-white";
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide whitespace-nowrap shadow-sm ${cls}`}
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
    <div className="mt-5 p-7 bg-white rounded-3xl border border-lilac-mid/30 shadow-md text-center">
      <div
        className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-3"
        style={{
          background:
            tone === "success"
              ? "linear-gradient(135deg, #FFF6E3, #FCDFCD)"
              : tone === "fail"
              ? "rgba(244,184,200,0.18)"
              : "rgba(159,138,208,0.12)",
        }}
      >
        {tone === "progress" && <SpinnerDots />}
        {tone === "success" && (
          <StarIcon className="w-9 h-9 animate-star-twinkle" />
        )}
        {tone === "fail" && (
          <span className="text-[28px]" aria-hidden>
            😢
          </span>
        )}
      </div>
      <p
        className={`text-[15px] font-bold leading-tight ${
          tone === "fail" ? "text-rose-500" : "text-eye-purple"
        }`}
      >
        {message}
      </p>
      {tone === "progress" && (
        <p className="text-[11px] text-text-light mt-2">잠깐만, 마무리 중이야</p>
      )}
      {tone === "success" && (
        <p className="text-[11px] text-text-light mt-2">잔액 확인 후 이동할게</p>
      )}
      {tone === "fail" && (
        <button
          onClick={onRetry}
          className="mt-4 px-5 py-2.5 bg-lilac-deep text-white rounded-full text-[12px] font-bold hover:bg-lilac-deep/90 transition-colors"
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

// ━━━━━━━━━━ 배너 ━━━━━━━━━━

function Banner({
  tone,
  children,
}: {
  tone: "success" | "fail" | "warn";
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "bg-[#E5F4E0] text-[#3F7A2F]"
      : tone === "fail"
      ? "bg-rose-100 text-rose-500"
      : "bg-gold-soft/20 text-[#7A5A1F]";
  return (
    <div className={`mt-3 p-3 rounded-xl text-[12px] text-center font-bold ${cls}`}>
      {children}
    </div>
  );
}

// ━━━━━━━━━━ 섹션 디바이더 ━━━━━━━━━━

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mt-7 mb-4">
      <div className="flex-1 h-px bg-lilac-mid/30" />
      <span className="text-[11px] font-bold text-text-light tracking-[0.15em]">
        {label}
      </span>
      <div className="flex-1 h-px bg-lilac-mid/30" />
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center px-5">
          <p className="text-text-light text-sm">별 충전소 준비 중…</p>
        </main>
      }
    >
      <ShopContent />
    </Suspense>
  );
}
