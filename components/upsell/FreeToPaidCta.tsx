"use client";

// 무료 상품(MBTI·별자리) 결과 → 유료 사주 유도 CTA. 목적지는 20~40★만(콜드 페이월 60★+ 금지).
import Link from "next/link";
import { FORTUNE_CONFIG, FORTUNE_GRADIENTS, type FortuneType } from "@/lib/fortune/types";
import { FortuneIcon } from "@/components/fortune/FortuneIcon";
import { trackUiEvent } from "@/lib/analytics/ui-events";

export default function FreeToPaidCta({
  title = "네 사주, 더 깊이 볼래?",
  subtitle,
  products,
  source,
  chat,
}: {
  title?: string;
  subtitle?: string;
  products: FortuneType[]; // 20~40★ 사주 종목만 넘길 것
  source: string; // 계측 귀속 (mbti|byeoljari)
  /** 타로톡(대화) 카드 — 검증된 전환 엔진. 무료 유저의 저마찰 유료 진입. */
  chat?: { label: string; tagline: string };
}) {
  const items = products
    .map((t) => FORTUNE_CONFIG[t])
    .filter((f) => f && f.active && f.cost > 0 && f.cost <= 40);
  if (items.length === 0 && !chat) return null;
  return (
    <div className="w-full max-w-md mx-auto px-5 mt-8 flex flex-col gap-3">
      {/* 결과 본문과 CTA 구분선 — 골드 별 + 라일락 헤어라인(별콩 모티프) */}
      <div className="flex items-center gap-3 mb-1" aria-hidden>
        <span className="h-px flex-1 bg-lilac-soft/70" />
        <span className="text-gold text-[11px] leading-none">✦</span>
        <span className="h-px flex-1 bg-lilac-soft/70" />
      </div>
      <div className="px-1">
        <p className="text-[14px] font-extrabold text-eye-purple">{title}</p>
        {subtitle && <p className="text-[12px] text-text-light/80 mt-0.5">{subtitle}</p>}
      </div>
      {chat && (
        <Link
          href="/"
          onClick={() => trackUiEvent("result_cta_clicked", { meta: { cta: "chat", product: "tarot", source } })}
          className="flex items-center gap-3.5 p-4 bg-white/90 rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition"
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-[22px] shrink-0"
            style={{ background: "linear-gradient(135deg, #EFEAF6 0%, #DACFEC 100%)" }}
          >
            🃏
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-bold text-eye-purple">{chat.label}</span>
              <span className="text-[10px] font-bold text-sub-warm bg-gold-soft/30 px-1.5 py-0.5 rounded-full">
                타로톡
              </span>
            </div>
            <p className="text-[12px] text-text-light mt-0.5 leading-snug line-clamp-2">{chat.tagline}</p>
          </div>
          <span className="text-eye-purple/50 text-[16px] shrink-0">›</span>
        </Link>
      )}
      {items.map((f) => (
        <Link
          key={f.type}
          href={f.href}
          onClick={() => trackUiEvent("result_cta_clicked", { meta: { cta: "cross_sell", product: f.type, source } })}
          className="flex items-center gap-3.5 p-4 bg-white/90 rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition"
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: FORTUNE_GRADIENTS[f.type] }}
          >
            <FortuneIcon type={f.type} size={36} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-bold text-eye-purple">{f.label}</span>
              <span className="text-[10px] font-bold text-lilac-deep bg-lilac-soft/60 px-1.5 py-0.5 rounded-full">
                ⭐ {f.cost}
              </span>
            </div>
            <p className="text-[12px] text-text-light mt-0.5 leading-snug line-clamp-2">{f.tagline}</p>
          </div>
          <span className="text-eye-purple/50 text-[16px] shrink-0">›</span>
        </Link>
      ))}
    </div>
  );
}
