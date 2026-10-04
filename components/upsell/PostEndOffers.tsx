"use client";

import { useEffect, type ReactNode } from "react";
import { CLARIFIER_COST, EXTEND_COST, EXTEND_TURNS } from "@/lib/upsell";

type Product = "extend" | "clarifier";

interface Props {
  extend: boolean;
  clarifier: boolean;
  /** 구매 요청이 서버에 가 있는 상품 — 두 칩을 잠그고, 그 상품 칩에만 '처리 중…' 을 보인다(다른 칩은 내용 그대로) */
  busy?: Product | null;
  onExtend: () => void;
  onClarifier: () => void;
  /** 노출 계측 — 부모가 리딩·상품·지면 단위로 dedup */
  onShown?: (product: Product) => void;
}

// 선 아이콘 — 저장소에 아이콘 라이브러리가 없어 인라인 SVG 로 그린다. 14px · stroke=currentColor · 둥근 끝(칩의 글자색을 따른다)
function LineIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

/** 말풍선 윤곽 — 대화 연장 */
function BubbleIcon() {
  return (
    <LineIcon>
      <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
    </LineIcon>
  );
}

/** 겹친 카드 두 장 윤곽 — 보조 카드(뒤 카드는 앞 카드에 가려지는 모서리만 그려 선이 겹치지 않게) */
function CardsIcon() {
  return (
    <LineIcon>
      <path d="M8 18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
      <rect x="8" y="7" width="12" height="15" rx="2" />
    </LineIcon>
  );
}

function OfferChip({
  icon,
  label,
  price,
  ariaLabel,
  working,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  price: number;
  ariaLabel: string;
  working: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-busy={working || undefined}
      // whitespace-nowrap: 칩 안에서 단어가 꺾이지 않는다(폭이 모자라면 칩 단위로 줄을 바꾼다) · relative: 처리 중 문구를 겹쳐 놓는 기준
      className="relative inline-flex items-center whitespace-nowrap rounded-full border border-gold bg-cream-warm px-3 py-1.5 text-[12px] text-eye-purple transition enabled:hover:bg-gold/10 enabled:active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {/* 처리 중에도 원래 내용을 자리에 남겨(보이지 않게) 칩 폭이 바뀌지 않게 한다 */}
      <span className={`inline-flex items-center gap-[5px]${working ? " invisible" : ""}`}>
        {icon}
        <span className="font-bold">{label}</span>
        {/* 가격 글자색 #8A6A1F — 금빛을 눌러 cream-warm 위에서 AA(약 4.8:1)를 넘긴다 */}
        <span className="font-normal text-[#8A6A1F]">⭐{price}</span>
      </span>
      {working && <span className="absolute inset-0 flex items-center justify-center font-bold">처리 중…</span>}
    </button>
  );
}

/**
 * 강제 종료선에서 닫힌 대화의 재개 제안 — '결과 보기 →' 아래 가는 구분선 + 작은 칩 한 줄 (spec 2026-10-04 §3-4, 시안 C).
 * 별콩이 대사는 늘리지 않는다. 노출 조건(강제 종료·비위기·한도)은 서버가 판정해 넘긴다.
 */
export default function PostEndOffers({ extend, clarifier, busy, onExtend, onClarifier, onShown }: Props) {
  useEffect(() => {
    if (extend) onShown?.("extend");
    if (clarifier) onShown?.("clarifier");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extend, clarifier]);

  if (!extend && !clarifier) return null;

  const locked = !!busy;

  return (
    <div className="pt-1">
      {/* 가는 구분선 + 가운데 안내 — 하단 바는 흰 배경이라 text-light 를 쓴다 */}
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-px flex-1 bg-lilac-mid/40" />
        <p className="whitespace-nowrap text-[11px] text-text-light">아직 할 얘기가 남았다면</p>
        <span aria-hidden="true" className="h-px flex-1 bg-lilac-mid/40" />
      </div>
      {/* 375px 에선 한 줄. 320px 근처에서 폭이 모자라면 칩 단위로 두 줄 가운데 정렬 */}
      <div className="mt-2 flex flex-wrap justify-center gap-x-2 gap-y-1.5">
        {extend && (
          <OfferChip
            icon={<BubbleIcon />}
            label={`${EXTEND_TURNS}턴 더`}
            price={EXTEND_COST}
            ariaLabel={`대화 ${EXTEND_TURNS}턴 더 이어가기, 별 ${EXTEND_COST}개`}
            working={busy === "extend"}
            disabled={locked}
            onClick={onExtend}
          />
        )}
        {clarifier && (
          <OfferChip
            icon={<CardsIcon />}
            label="카드 한 장 더"
            price={CLARIFIER_COST}
            ariaLabel={`카드 한 장 더 뽑고 이어가기, 별 ${CLARIFIER_COST}개`}
            working={busy === "clarifier"}
            disabled={locked}
            onClick={onClarifier}
          />
        )}
      </div>
    </div>
  );
}
