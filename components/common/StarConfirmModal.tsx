"use client";

// 별 결제 확인 팝업 — 타로 카드 뽑기 + 별콩 운세 공용.
// 타로는 spreadLabel 기반 기본 카피, 운세는 title/subtitle 직접 전달.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
  onConfirm,
  onCharge,
  onClose,
}: StarConfirmModalProps) {
  // 팝업은 body 로 포털 — 페이지 <main> 의 animate-fade-in(transform) 이 만드는
  // 스택 컨텍스트에 갇혀 헤더/하단탭(z-50/z-40) 아래로 깔리는 문제를 피한다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const insufficient = balance !== null && balance < cost;
  const afterBalance = balance !== null ? balance - cost : null;
  const heading = title ?? `별 ${cost}개로 상담을 시작할까?`;
  const sub = subtitle ?? (spreadLabel ? `${spreadLabel} 풀이가 바로 시작돼` : "");

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-night/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-auto bg-cream rounded-t-3xl sm:rounded-3xl p-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
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
          <p className="font-display text-[17px] text-eye-purple leading-tight">
            {heading}
          </p>
          {sub && (
            <p className="text-[12px] text-text-light/85 mt-1">{sub}</p>
          )}
        </div>

        {/* 비용/잔액 요약 */}
        <div className="rounded-2xl bg-cream-warm border border-lilac-mid/20 px-4 py-3 mb-5 text-[13px]">
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
            <p className="text-[12px] text-red-500 font-bold text-center mt-2">
              별이 {cost - (balance ?? 0)}개 부족해
            </p>
          )}
        </div>

        {/* 액션 */}
        <div className="flex flex-col gap-2.5">
          {insufficient ? (
            <button
              onClick={onCharge}
              className="w-full py-3.5 rounded-full text-white font-bold text-[14px] active:scale-[0.98] transition-all"
              style={{ background: accent, boxShadow: `0 6px 18px ${accent}55` }}
            >
              별 충전하러 가기
            </button>
          ) : (
            <button
              onClick={onConfirm}
              disabled={loading || balance === null}
              className="w-full py-3.5 rounded-full text-white font-bold text-[14px] active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100"
              style={{
                background: accent,
                boxShadow:
                  loading || balance === null ? "none" : `0 6px 18px ${accent}55`,
              }}
            >
              {confirmLabel ?? "확인하고 시작하기"}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-3 text-[13px] font-bold text-lilac-deep rounded-full bg-transparent border-2 border-lilac-deep/40 hover:border-lilac-deep/70 hover:bg-lilac-deep/5 transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
