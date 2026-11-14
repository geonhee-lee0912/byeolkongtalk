"use client";

// 결과 화면 최상단 재충전 블록 — 리딩 직후 따끈한 순간에 매출 CTA를 앞세운다.
// 이 고민 이어가기(-40%) + 새 고민.
// 🔴 첫충전 +20% 배너는 2026-09-29 제거됐다 — 9월 클릭 1건으로 죽어 있었고,
//    같은 안내를 RechargeSheet 가 결정 시점에 보여준다. 되살리지 말 것.
import Link from "next/link";
import { trackUiEvent } from "@/lib/analytics/ui-events";

export default function RechargeBlock({
  allowContinue,
  onContinue,
  showContinue = true,
  newHref,
  newLabel,
  newCostLabel,
  newDesc,
  readingId,
  onNew,
}: {
  allowContinue: boolean;
  onContinue?: () => void;
  /** 이어가기 CTA 노출 여부 (기본 노출; 타로 결과화면은 false — 사용률 2.3%). */
  showContinue?: boolean;
  newHref: string;
  newLabel: string;
  newCostLabel: string;
  /** 새 CTA 라벨 아래 보조 설명 (선택). */
  newDesc?: string;
  /** 계측 귀속용 reading id (선택). */
  readingId?: string;
  /** 새 CTA 를 누른 순간(이동 전) — 타로 결과는 여기서 이 고민을 넘긴다(lib/tarot/redraw). */
  onNew?: () => void;
}) {
  return (
    <div className="w-full max-w-md mx-auto px-5 mt-6">
      <div className="card">
        {showContinue && (
          <p className="text-14 font-bold text-eye-purple mb-3">
            이 고민, 더 깊이 이어가볼까?
          </p>
        )}
        {showContinue && allowContinue && onContinue && (
          <button
            onClick={() => {
              trackUiEvent("result_cta_clicked", { readingId, meta: { cta: "continue" } });
              onContinue();
            }}
            className="btn btn-primary btn-lg mb-2 justify-between"
          >
            <span>이 고민 이어가기</span>
            <span className="text-12 font-bold bg-white/20 rounded-lg px-2 py-0.5">
              40% 할인
            </span>
          </button>
        )}
        <Link
          href={newHref}
          onClick={() => {
            trackUiEvent("result_cta_clicked", { readingId, meta: { cta: "new" } });
            onNew?.();
          }}
          className={`btn btn-lg justify-between px-4 ${showContinue ? "btn-secondary" : "btn-primary"}`}
        >
          <span className="flex flex-col min-w-0">
            <span>{newLabel}</span>
            {newDesc && (
              <span
                className={`text-11 font-normal mt-0.5 ${
                  showContinue ? "text-text-light" : "text-white/80"
                }`}
              >
                {newDesc}
              </span>
            )}
          </span>
          <span
            className={`text-12 shrink-0 ml-2 ${
              showContinue ? "text-text-light" : "text-white/80"
            }`}
          >
            {newCostLabel}
          </span>
        </Link>
      </div>
    </div>
  );
}
