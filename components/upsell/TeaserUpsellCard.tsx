"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SPREAD_INFO } from "@/lib/tarot/spreads";
import { getDeepProduct, productPositions, productPrice } from "@/lib/tarot/menu";
import { koCardCount } from "@/lib/tarot/menu-price";
import { saveDeepContinuation } from "@/lib/tarot/menu-session";
import { trackUiEvent } from "@/lib/analytics/ui-events";

export type TeaserSurface = "reading_end" | "result";

/**
 * 맛보기 끝 "이어서 깊게" — 같은 질문의 깊게 상품 자리를 펼쳐 보인다. 첫 자리 = 방금 본 한 장("지금 마음 ✓"), 나머지 🔒.
 * 가격은 정가(이어가기 할인 없음 — 맛보기 뒤 이어가기가 처음부터 깊게보다 싸면 우회로가 된다, 사용자 확정).
 * 경로 = 기존 tarot-fresh 이어가기 + 깊게 선택(동의) → 카드 뽑기로 바로. 서버가 부모 소유·비민감·[END] 를 검증한다.
 * 노출 조건(메뉴판 그룹·맛보기 리딩·[END]·비민감·소유자)은 호출부가 판단한다. 스펙 2026-10-05-타로톡-메뉴판-별경제 §6 · §9-1.
 */
export default function TeaserUpsellCard({
  parentReadingId,
  emotion,
  concern,
  surface,
}: {
  parentReadingId: string;
  emotion: string | null;
  concern: string;
  surface: TeaserSurface;
}) {
  const router = useRouter();
  const deep = getDeepProduct(emotion);
  const deepKey = deep?.key ?? null;
  const shownRef = useRef(false);

  // 노출 — 지면·마운트당 1회
  useEffect(() => {
    if (!deepKey || shownRef.current) return;
    shownRef.current = true;
    trackUiEvent("teaser_upsell_shown", {
      readingId: parentReadingId,
      meta: { surface, deepProduct: deepKey },
    });
  }, [deepKey, parentReadingId, surface]);

  if (!deep) return null;

  const count = koCardCount(SPREAD_INFO[deep.spreadType].cardCount);
  const locked = productPositions(deep).slice(1);

  const go = () => {
    trackUiEvent("teaser_upsell_clicked", {
      readingId: parentReadingId,
      meta: { surface, deepProduct: deep.key },
    });
    saveDeepContinuation(sessionStorage, { parentReadingId, deep, concern });
    router.push("/tarot/draw");
  };

  return (
    <div className="rounded-2xl border-2 border-gold bg-cream-warm px-4 py-3 text-left">
      <p className="text-[13.5px] font-black leading-snug text-eye-purple">{deep.name}</p>
      <p className="mt-0.5 text-[11.5px] text-eye-purple/80">
        한 장으로 본 건 지금 마음까지 — {count}이면 여기까지 열려
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        <span className="rounded-md bg-lilac-deep px-1.5 py-0.5 text-[10.5px] font-bold text-white">지금 마음 ✓</span>
        {locked.map((label) => (
          <span key={label} className="rounded-md bg-lilac-soft px-1.5 py-0.5 text-[10.5px] text-eye-purple/80">
            {label} 🔒
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={go}
        className="mt-2.5 w-full rounded-full bg-gold py-2.5 text-[13px] font-black text-night transition active:scale-[0.98]"
      >
        이 고민 이어서 {count}으로 · ⭐{productPrice(deep)}
      </button>
    </div>
  );
}
