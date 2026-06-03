"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { FORTUNE_LIST } from "@/lib/fortune/types";

const FORTUNE_TABS = [
  { key: "saju", label: "사주" },
  { key: "tarot", label: "타로" },
] as const;

type FortuneTab = (typeof FORTUNE_TABS)[number]["key"];

export default function FortunePage() {
  const [tab, setTab] = useState<FortuneTab>("saju");
  const items = FORTUNE_LIST.filter((f) => f.base === tab);

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 flex flex-col items-center mb-6">
        <div className="relative">
          <Image src="/byeolkong-main.png" alt="별콩이" width={110} height={110} priority />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold text-eye-purple text-center">
          별콩 운세
        </h1>
        <p className="mt-2 text-[13px] text-text-light text-center leading-relaxed">
          길게 얘기할 시간 없을 땐,
          <br />
          별콩이가 한 장으로 정리해줄게.
        </p>
      </div>

      <div className="w-full max-w-md mx-auto px-5 mb-4">
        <div className="flex gap-1 bg-lilac-soft/40 rounded-full p-1">
          {FORTUNE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={[
                "flex-1 py-2 rounded-full text-[14px] font-bold transition",
                tab === t.key
                  ? "bg-cream-warm text-eye-purple shadow-sm"
                  : "text-text-light/70",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-3">
        {items.map((f) => {
          const inner = (
            <div
              className={[
                "w-full rounded-2xl p-4 border flex items-center gap-3.5 transition",
                f.active
                  ? "bg-cream-warm border-lilac-mid/40 hover:border-lilac-deep/60 active:scale-[0.99]"
                  : "bg-cream-warm/50 border-divider/60 opacity-70",
              ].join(" ")}
            >
              <div className="w-12 h-12 rounded-xl bg-lilac-soft/60 flex items-center justify-center text-[24px] shrink-0">
                {f.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-eye-purple">{f.label}</span>
                  {f.cost === 0 ? (
                    <span className="text-[10px] font-bold text-sub-warm bg-gold-soft/30 px-1.5 py-0.5 rounded-full">
                      무료
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-lilac-deep bg-lilac-soft/60 px-1.5 py-0.5 rounded-full">
                      ⭐ {f.cost}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-text-light/80 mt-1 leading-snug line-clamp-2">
                  {f.tagline}
                </p>
              </div>
              {f.active ? (
                <span className="text-text-light/40 text-lg shrink-0">›</span>
              ) : (
                <span className="text-[10px] text-text-light/50 shrink-0">준비 중</span>
              )}
            </div>
          );

          return f.active ? (
            <Link key={f.type} href={f.href}>
              {inner}
            </Link>
          ) : (
            <div key={f.type}>{inner}</div>
          );
        })}
      </div>

      <p className="mt-6 text-[11px] text-text-light/50 text-center px-8 leading-relaxed">
        운세는 정해진 미래가 아니라 흐름과 가능성을 비춰주는 거야.
        <br />
        결과는 <span className="text-text-light/70">내 고민톡</span>에서 다시 볼 수 있어.
      </p>
    </main>
  );
}
