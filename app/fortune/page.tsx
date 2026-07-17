"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { FORTUNE_LIST, FORTUNE_GRADIENTS, FORTUNE_HASHTAGS } from "@/lib/fortune/types";
import FortuneGeneratingList from "@/components/fortune/FortuneGeneratingList";
import RedHorseIcon from "@/components/fortune/RedHorseIcon";

interface DailyStatus {
  used: number;
  limit: number;
  remaining: number;
  nextCost: number;
}

export default function FortunePage() {
  const [daily, setDaily] = useState<DailyStatus | null>(null);
  const items = FORTUNE_LIST;

  useEffect(() => {
    void fetch("/api/fortune/daily-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDaily(d))
      .catch(() => {});
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 flex flex-col items-center mb-6">
        <div className="relative">
          <Image src="/byeolkong-main.png" alt="별콩이" width={110} height={110} priority />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold text-eye-purple text-center">
          사주 운세
        </h1>
        <p className="mt-2 text-[13px] text-text-light text-center leading-relaxed">
          길게 얘기할 시간 없을 땐,
          <br />
          별콩이가 한 장으로 정리해줄게.
        </p>
      </div>

      <FortuneGeneratingList />

      <div className="w-full max-w-md mx-auto px-5 mb-4">
        <div
          className="p-4 rounded-2xl border border-lilac/40 shadow-[0_4px_18px_rgba(90,62,140,0.08)]"
          style={{
            background: "linear-gradient(135deg, #F6EFFF 0%, #EFE6FB 50%, #FBEFF4 100%)",
          }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[14px] leading-none" aria-hidden>
              💡
            </span>
            <span className="text-[12px] font-extrabold text-lilac-deep tracking-wide">
              이렇게 사용해요
            </span>
          </div>
          <p className="text-[12.5px] text-text-light leading-relaxed">
            별콩 운세는 대화가 아니라, 생일·고민을 입력하면 별콩이가 한 장의 리포트로
            정리해주는 방식이에요. 가볍게 골라봐요.
          </p>
        </div>
      </div>

      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-3">
        {items.map((f) => {
          const freeStatus = f.type === "daily" ? daily : null;
          const inner = (
            <div
              className={[
                "w-full rounded-2xl p-4 border flex items-center gap-3.5 transition",
                f.active
                  ? "bg-white border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] hover:border-lilac-deep/60 active:scale-[0.99]"
                  : "bg-white/40 border-lilac-mid/15 opacity-70",
              ].join(" ")}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-[24px] shrink-0"
                style={{ background: FORTUNE_GRADIENTS[f.type] }}
              >
                {f.type === "saju_full" ? <RedHorseIcon size={30} /> : f.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-eye-purple">{f.label}</span>
                  {f.cost === 0 ? (
                    freeStatus && freeStatus.remaining <= 0 ? (
                      <span className="text-[10px] font-bold text-text-light/70 bg-lilac-soft/60 px-1.5 py-0.5 rounded-full">
                        무료 소진 · ⭐ {freeStatus.nextCost}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-sub-warm bg-gold-soft/30 px-1.5 py-0.5 rounded-full">
                        무료{freeStatus ? ` ${freeStatus.remaining}/${freeStatus.limit}회` : ""}
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] font-bold text-lilac-deep bg-lilac-soft/60 px-1.5 py-0.5 rounded-full">
                      ⭐ {f.cost}
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] text-text-light/80 mt-1 leading-snug line-clamp-2">
                  {f.tagline}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {FORTUNE_HASHTAGS[f.type].map((h) => (
                    <span
                      key={h}
                      className="text-[11px] font-bold text-lilac-deep bg-lilac-soft/60 px-2 py-0.5 rounded-full"
                    >
                      #{h}
                    </span>
                  ))}
                </div>
              </div>
              {!f.active && (
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
