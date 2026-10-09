"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { EMOTION_OPTIONS, normalizeEmotionTag, type PendingConsultation } from "@/lib/emotions";
import { getMenu, productPrice, type MenuProduct } from "@/lib/tarot/menu";
import { isGiftFree } from "@/lib/tarot/menu-price";
import { saveMenuSelection } from "@/lib/tarot/menu-session";
import { CONCERN_REWRITE_HREF } from "@/lib/tarot/session";
import type { Wallet } from "@/lib/wallet";
import { WELCOME_BONUS_STARS } from "@/lib/constants";
import { TAROT_HERO_GRADIENT } from "@/lib/heroGradients";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import MenuProductCard from "@/components/tarot/MenuProductCard";
import CompareSheet from "@/components/tarot/CompareSheet";

// 질문 메뉴판 — 반반 비교의 메뉴판 그룹 화면(스펙 docs/superpowers/specs/2026-10-05-타로톡-메뉴판-별경제-design.md §4·§5·§9-1).
// 그 질문의 맛보기 → 3장 → 깊게(→ 끝까지). 맛보기는 탭 한 번에 카드 뽑기로 간다(카드에 가격이 적혀 있어 그 탭이 가격 동의).
// 유료는 비교 창의 '이걸로 볼래'가 동의. 동의한 선택은 consented 로 실어 보내고, 카드 뽑기가 잔액이 충분하면 팝업 없이 대화로.
export default function TarotMenu({ pending, wallet }: { pending: PendingConsultation; wallet: Wallet }) {
  const router = useRouter();
  const [comparing, setComparing] = useState<MenuProduct | null>(null);
  const viewedRef = useRef(false);
  // 이동이 시작된 뒤의 탭은 무시한다 — 연타가 계측을 두 번 찍거나 시트 칸을 남기지 않게(돌아오면 재마운트로 초기화)
  const leavingRef = useRef(false);
  const tag = normalizeEmotionTag(pending.emotion);
  const menu = useMemo(() => getMenu(tag), [tag]);

  // 메뉴는 현행 질문 10개에만 있다 — 모르는 태그면 고민 쓰기로 돌려보낸다
  // ?rewrite=1 — 사주 대화의 [RECO:tarot] 추천 이동처럼 이어가기 표시를 심고 태그 없이 온 경우, 고민을 다시 적어도 그 이어가기가 남는다
  useEffect(() => {
    if (!tag) router.replace(CONCERN_REWRITE_HREF);
  }, [tag, router]);

  // 메뉴판 노출 — 마운트당 1회
  useEffect(() => {
    if (viewedRef.current || !tag) return;
    viewedRef.current = true;
    trackUiEvent("tarot_menu_viewed", {
      meta: { tag, giftUnused: wallet.giftUnused, balance: wallet.balance },
    });
  }, [tag, wallet]);

  if (!tag) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  const option = EMOTION_OPTIONS.find((o) => o.tag === tag);
  const teaser = menu.find((p) => p.tier === "teaser") ?? null;

  // 비교 창은 뒤로가기로 닫히게 history 를 한 칸 쌓는다 — 거기서 떠날 땐 그 칸을 바꿔 써서 뒤로가기가 두 번 걸리지 않게
  const start = (p: MenuProduct, from: "menu" | "sheet") => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    saveMenuSelection(sessionStorage, p, pending.concern);
    if (from === "sheet") router.replace("/tarot/draw");
    else router.push("/tarot/draw");
  };

  const trackSelected = (p: MenuProduct) =>
    trackUiEvent("tarot_product_selected", {
      meta: {
        tag,
        product: p.key,
        spread: p.spreadType,
        tier: p.tier,
        price: productPrice(p),
        balance: wallet.balance,
      },
    });

  const onCardTap = (p: MenuProduct) => {
    if (leavingRef.current) return;
    trackSelected(p);
    if (p.tier === "teaser") {
      start(p, "menu");
      return;
    }
    trackUiEvent("tarot_compare_opened", { meta: { product: p.key } });
    setComparing(p);
  };

  return (
    <main className="flex flex-1 flex-col items-center pb-8 w-full animate-fade-in">
      {/* 최상단 — 고민 다시 적기(이어가기 도중이면 그 이어가기를 유지한다 — CONCERN_REWRITE_HREF, Task 8 B안) */}
      <div className="w-full max-w-md mx-auto px-5 pt-3">
        <Link
          href={CONCERN_REWRITE_HREF}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-text-light/70 hover:text-lilac-deep transition-colors"
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
          <span>고민 다시 적기</span>
        </Link>
      </div>

      {/* 별콩이 + 타이틀 — 상품 카드가 첫 화면에 더 들어오게 옛 화면보다 작게 */}
      <div className="w-full max-w-md mx-auto px-5 flex flex-col items-center mt-1 mb-4">
        <Image
          src="/byeolkong-tarot.png"
          alt="별콩이"
          width={88}
          height={88}
          priority
          className="drop-shadow-lg"
        />
        <h1 className="font-display text-[22px] text-eye-purple text-center mt-3 tracking-wide leading-snug">
          너의 고민을 내가 해결해 줄게
        </h1>
        <p className="text-[12px] text-text-light text-center mt-1">어디까지 깊이 볼지 골라줘 ✨</p>
      </div>

      {/* 고민 내용 — 히어로 팔레트 배경 */}
      <div className="w-full max-w-md mx-auto px-5 mb-4">
        <div
          className="p-4 rounded-2xl border border-lilac-mid/25"
          style={{ background: TAROT_HERO_GRADIENT }}
        >
          <div className="flex items-center gap-2 mb-2">
            {option && <span className="text-lg">{option.emoji}</span>}
            <span className="text-[13px] font-bold text-gold-soft">{tag}</span>
          </div>
          <p className="text-[13px] text-white/75 leading-relaxed line-clamp-3">
            {pending.concern}
          </p>
        </div>
      </div>

      {/* 가입 선물 배너 — 맛보기를 선물로 볼 수 있을 때만 */}
      {isGiftFree(wallet) && (
        <div className="w-full max-w-md mx-auto px-5 mb-4">
          <p className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-gold-soft to-gold text-[13px] font-black text-eye-purple">
            🎁 가입 선물 별 {WELCOME_BONUS_STARS}개 — 첫 질문은 공짜야
          </p>
        </div>
      )}

      {/* 상품 — 위에서부터 맛보기 → 3장 → 깊게 → 끝까지 */}
      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-3.5">
        {menu.map((p) => (
          <MenuProductCard key={p.key} product={p} wallet={wallet} onSelect={() => onCardTap(p)} />
        ))}
      </div>

      {/* 크로스링크 */}
      <div className="w-full max-w-md mx-auto px-5 mt-4 flex flex-col gap-2">
        {tag === "직장·학교에서 사람이 어려워" && (
          <Link
            href="/fortune/compat-social"
            className="flex items-center justify-between p-3.5 rounded-2xl border border-dashed border-lilac-mid/60 bg-cream/50"
          >
            <span className="text-[12.5px] text-eye-purple">
              🤝 두 사람 사주로 보는 <b>인간관계 궁합</b>도 있어
            </span>
            <span className="text-text-light text-[12px]">›</span>
          </Link>
        )}
      </div>

      {comparing && teaser && (
        <CompareSheet
          product={comparing}
          teaser={teaser}
          wallet={wallet}
          onConfirm={() => {
            if (leavingRef.current) return;
            trackUiEvent("tarot_compare_confirmed", { meta: { product: comparing.key } });
            start(comparing, "sheet");
          }}
          onTeaser={() => {
            if (leavingRef.current) return;
            trackSelected(teaser);
            start(teaser, "sheet");
          }}
          onClose={() => setComparing(null)}
        />
      )}
    </main>
  );
}
