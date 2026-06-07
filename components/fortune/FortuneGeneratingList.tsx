"use client";

// 별콩 운세 페이지에서 백그라운드 생성 중인 리포트를 서버 상태 기반으로 보여준다.
// 내 고민톡(/readings)의 '생성 중' 카드와 동일한 모양 — 생성이 끝나면 '보러가기' 카드로 전환.

import { useEffect, useState } from "react";
import Link from "next/link";
import { fortuneTypeFromTag, FORTUNE_CONFIG } from "@/lib/fortune/types";
import RedHorseIcon from "@/components/fortune/RedHorseIcon";

interface FortuneReading {
  id: string;
  question: string;
  emotionTag?: string | null;
  generating?: boolean;
}

// 생성 중이었던 id 를 세션에 보관 — 완료 후 '보러가기' 카드가 페이지 재진입에도 유지된다.
// 결과를 실제로 열어보면 result 페이지가 이 목록에서 해당 id 를 제거한다(확인 전까지 유지).
const SEEN_KEY = "byeolkong:fortune-seen-generating";

function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(s: Set<string>): void {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

function icon(emotionTag: string | null | undefined, size: number) {
  const ft = fortuneTypeFromTag(emotionTag);
  if (ft === "saju_full") return <RedHorseIcon size={size} />;
  return <span>{ft ? FORTUNE_CONFIG[ft].emoji : "✨"}</span>;
}

function label(r: FortuneReading): string {
  const ft = fortuneTypeFromTag(r.emotionTag);
  return ft ? FORTUNE_CONFIG[ft].label : r.question;
}

export default function FortuneGeneratingList() {
  const [readings, setReadings] = useState<FortuneReading[]>([]);
  // 이번 세션에서 생성 중이었던 id — 완료 후 '보러가기' 카드로 노출. 세션에 보관해 재진입에도 유지.
  const [seenGenerating, setSeenGenerating] = useState<Set<string>>(() => loadSeen());

  const load = async () => {
    const d = await fetch("/api/readings", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    const list = (d?.readings ?? []) as FortuneReading[];
    const fortune = list.filter((r) => fortuneTypeFromTag(r.emotionTag));
    setReadings(fortune);
    setSeenGenerating((prev) => {
      const next = new Set(prev);
      for (const r of fortune) if (r.generating) next.add(r.id);
      saveSeen(next);
      return next;
    });
  };

  useEffect(() => {
    void load();
  }, []);

  const generating = readings.filter((r) => r.generating);
  const justDone = readings.filter((r) => !r.generating && seenGenerating.has(r.id));

  // 생성 중이면 완료될 때까지 폴링.
  useEffect(() => {
    if (generating.length === 0) return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (!cancelled) void load();
    }, 3000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [generating.length]);

  if (generating.length === 0 && justDone.length === 0) return null;

  return (
    <div className="w-full max-w-md mx-auto px-5 mb-4 flex flex-col gap-2">
      {generating.map((r) => (
        <div
          key={r.id}
          className="rounded-2xl p-3.5 border border-gold/30 flex items-center gap-3 bg-gradient-to-br from-night to-night-deep"
        >
          <div className="w-10 h-10 rounded-lg bg-gold/15 flex items-center justify-center text-[18px]">
            {icon(r.emotionTag, 24)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-gold-soft font-medium line-clamp-1">
              {label(r)}
            </div>
            <div className="text-[11px] text-cream/60 mt-1 flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
              별콩이가 리포트를 만들고 있어…
            </div>
          </div>
        </div>
      ))}
      {justDone.map((r) => (
        <Link
          key={r.id}
          href={`/fortune/result?id=${r.id}&from=recover`}
          className="rounded-2xl p-3.5 border border-gold/30 flex items-center gap-3 bg-gradient-to-br from-night to-night-deep active:scale-[0.99] transition"
        >
          <div className="w-10 h-10 rounded-lg bg-gold/15 flex items-center justify-center text-[18px]">
            {icon(r.emotionTag, 24)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-gold-soft font-medium line-clamp-1">
              {label(r)}
            </div>
            <div className="text-[11px] text-gold mt-1">
              ✨ 리포트가 준비됐어 · 보러가기 →
            </div>
          </div>
          <span className="text-cream/40 text-sm">›</span>
        </Link>
      ))}
    </div>
  );
}
