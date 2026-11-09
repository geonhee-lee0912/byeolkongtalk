"use client";

// 별 결제 확인 팝업 — 타로 카드 뽑기 + 별콩 운세 공용.
// 타로는 spreadLabel 기반 기본 카피, 운세는 title/subtitle 직접 전달.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import Sheet from "./Sheet";
import OverlayCloseButton from "./OverlayCloseButton";

export interface StarConfirmModalProps {
  cost: number;
  balance: number | null;
  loading: boolean;
  accent: string;
  /** 미지정 시 spreadLabel 기반 기본 카피 사용 */
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  /** 풀이 대상 (사주 운세 상품 — 오늘의 운세 제외). 지정 시 요약 박스에 "대상" 줄 노출 */
  targetName?: string;
  /** 기본 카피용 (타로) */
  spreadLabel?: string;
  /** heading 블록과 비용/잔액 요약 박스 사이에 얹는 추가 콘텐츠(예: 별마루 구독 가치·가격). 미지정 시 아무것도 렌더하지 않는다 */
  extra?: ReactNode;
  /** 계측용 지면 키 — 잔액 부족(paywall_shown) 노출의 meta.surface. 충전 시트를 여는 지면은 RECHARGE_SOURCE 값과 맞춘다 */
  surface?: string;
  /** 확인을 처리 중 — 확인 버튼을 막는다. 눈에 보이는 쪽일 뿐이고 연타 차단 자체는 호출부의 ref 잠금이 한다
   *  (state 는 다음 렌더에야 반영돼 같은 틱의 두 번째 탭을 못 막는다). 라벨은 호출부가 confirmLabel 로 바꾼다 */
  busy?: boolean;
  onConfirm: () => void;
  onCharge: () => void;
  onClose: () => void;
}

export default function StarConfirmModal({
  cost,
  balance,
  loading,
  accent,
  title,
  subtitle,
  confirmLabel,
  targetName,
  spreadLabel,
  extra,
  surface,
  busy = false,
  onConfirm,
  onCharge,
  onClose,
}: StarConfirmModalProps) {
  // 팝업은 body 로 포털(Sheet) — 페이지 <main> 의 animate-fade-in(transform) 이 만드는
  // 스택 컨텍스트에 갇혀 헤더/하단탭(z-50/z-40) 아래로 깔리는 문제를 피한다. mounted 는 첫 그림(서버)과 맞추려고 둔다
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const insufficient = balance !== null && balance < cost;
  const afterBalance = balance !== null ? balance - cost : null;

  // 잔액 부족 노출 계측 — Meta AddToCart 의 원천(2026-10-04, lib/analytics/ui-events.ts 참조).
  // 잔액 로딩이 끝나 "부족"이 확정된 순간 마운트당 1회. loading 중엔 balance 가 스테일일 수 있어 기다린다.
  const paywallTracked = useRef(false);
  useEffect(() => {
    if (paywallTracked.current || loading || !insufficient) return;
    paywallTracked.current = true;
    trackUiEvent("paywall_shown", { meta: { cost, balance, surface } });
  }, [insufficient, loading, cost, balance, surface]);
  const heading = title ?? `별 ${cost}개로 상담을 시작할까?`;
  const sub = subtitle ?? (spreadLabel ? `${spreadLabel} 풀이가 바로 시작돼` : "");

  if (!mounted) return null;

  // 판은 공통 Sheet 기본 판 그대로(max-h 88vh + 스크롤 — 구독 시트처럼 긴 호출부에서도 확인 버튼에 손이 닿는다)
  return (
    <Sheet label={heading} onClose={onClose} z={80}>
        {/* 별콩이 + 안내 */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="relative w-12 h-12 mb-2">
            <div className="absolute inset-0 bg-gold/30 rounded-full blur-lg scale-110" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/profile.png"
              alt="별콩이"
              className="relative w-full h-full object-contain"
            />
          </div>
          <p className="font-display text-17 text-eye-purple leading-tight">
            {heading}
          </p>
          {sub && (
            <p className="text-12 text-text-light mt-1">{sub}</p>
          )}
        </div>

        {extra}

        {/* 비용/잔액 요약 */}
        <div className="card-inner mb-5 text-13">
          {targetName && (
            <div className="flex items-center justify-between py-1 border-b border-lilac-mid/15 mb-1 pb-2">
              <span className="text-text-light">대상</span>
              <span className="font-bold text-eye-purple">{targetName}</span>
            </div>
          )}
          <div className="flex items-center justify-between py-1">
            <span className="text-text-light">필요한 별</span>
            <span className="font-bold text-eye-purple tabular-nums">⭐ {cost}</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-text-light">현재 잔액</span>
            <span className="font-bold text-eye-purple tabular-nums">
              {loading || balance === null ? "…" : `⭐ ${balance}`}
            </span>
          </div>
          {!loading && afterBalance !== null && !insufficient && (
            <div className="flex items-center justify-between py-1 border-t border-lilac-mid/15 mt-1 pt-2">
              <span className="text-text-light">결제 후 잔액</span>
              <span className="font-bold tabular-nums" style={{ color: accent }}>
                ⭐ {afterBalance}
              </span>
            </div>
          )}
          {!loading && insufficient && (
            <p className="text-12 text-red-500 font-bold text-center mt-2">
              별이 {cost - (balance ?? 0)}개 부족해
            </p>
          )}
        </div>

        {/* 액션 */}
        <div className="flex flex-col gap-2.5">
          {insufficient ? (
            <button
              onClick={onCharge}
              // 바탕은 스프레드 고유 색(accent) — 모양만 공용 큰 버튼
              className="btn btn-lg text-white"
              style={{ background: accent }}
            >
              별 충전하러 가기
            </button>
          ) : (
            <button
              onClick={onConfirm}
              disabled={loading || balance === null || busy}
              className="btn btn-lg text-white"
              style={{ background: accent }}
            >
              {confirmLabel ?? "확인하고 시작하기"}
            </button>
          )}
          <OverlayCloseButton className="btn btn-text btn-lg">
            취소
          </OverlayCloseButton>
        </div>
    </Sheet>
  );
}
