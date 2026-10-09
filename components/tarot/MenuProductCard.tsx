"use client";

import { SPREAD_INFO } from "@/lib/tarot/spreads";
import { productPositions, type MenuProduct } from "@/lib/tarot/menu";
import { priceLine } from "@/lib/tarot/menu-price";
import type { Wallet } from "@/lib/wallet";

/**
 * 메뉴판 상품 카드 — 이름 · 카드 메타 · 카드 자리 칩 · 가격 줄 (스펙 §5-1·§5-3, 시안 menu-mock-v1 ②).
 * 맛보기 = 라일락 테두리 + "선물로 무료" 알약 · 깊게 = 금테 + "별콩이 추천" 리본.
 * 지갑을 읽은 뒤에만 그려진다(TarotMenu) — 가격을 못 본 탭이 동의가 되지 않게.
 */
export default function MenuProductCard({
  product,
  wallet,
  onSelect,
}: {
  product: MenuProduct;
  wallet: Wallet;
  onSelect: () => void;
}) {
  const info = SPREAD_INFO[product.spreadType];
  const line = priceLine(product, wallet);
  const isTeaser = product.tier === "teaser";
  const isDeep = product.tier === "deep";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative w-full rounded-2xl px-4 py-3 text-left transition active:scale-[0.99] ${
        isDeep
          ? "border-2 border-gold bg-cream-warm"
          : isTeaser
            ? "border-2 border-lilac-deep bg-white"
            : "border border-lilac-mid/40 bg-white"
      }`}
    >
      {isDeep && (
        <span className="absolute -top-2.5 right-3 rounded-full bg-gold px-2 py-0.5 text-[10px] font-black text-night">
          별콩이 추천
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14px] font-black leading-snug text-eye-purple">{product.name}</p>
        <span
          className={`shrink-0 text-[12.5px] font-black tabular-nums text-eye-purple ${
            line.free ? "rounded-full bg-lilac-soft px-2 py-0.5" : ""
          }`}
        >
          {line.main}
        </span>
      </div>
      {line.sub && <p className="mt-0.5 text-[11px] font-bold text-eye-purple/85">{line.sub}</p>}
      <p className="mt-1 text-[11px] text-eye-purple/70">
        🃏 {info.cardCount}장 · {isTeaser ? "질문의 답 하나 · 대화 이어가기 OK" : `질문 ${info.cardCount}개`}
      </p>
      {!isTeaser && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {productPositions(product).map((label) => (
            <span key={label} className="rounded-md bg-lilac-soft px-1.5 py-0.5 text-[10.5px] text-eye-purple">
              {label}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
