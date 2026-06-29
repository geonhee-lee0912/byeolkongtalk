"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { extractClosingLine } from "@/lib/saju/closing";
import { continuationPrice, fullCostFor } from "@/lib/continuation";
import type { SpreadType } from "@/lib/tarot/spreads";

const MIN_LEN = 10;
const MAX_LEN = 200;

interface MessageRow {
  role: "user" | "assistant";
  content: string;
}
interface ParentReading {
  id: string;
  question: string;
  consultationType?: string;
  spreadType?: SpreadType | null;
  spreadCategory?: string | null;
  emotionTag?: string | null;
  hasSensitive: boolean;
}

export default function ContinuePage({
  params,
}: {
  params: Promise<{ readingId: string }>;
}) {
  const { readingId } = use(params);
  const router = useRouter();
  const [parent, setParent] = useState<ParentReading | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [concern, setConcern] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (!me?.isAuthenticated) {
        router.replace(`/login?next=/continue/${readingId}`);
        return;
      }
      const d = await fetch(`/api/readings/${readingId}`, { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (!d?.reading) {
        setError("이어갈 고민을 불러오지 못했어");
        return;
      }
      const r = d.reading as ParentReading;
      if (r.hasSensitive) {
        router.replace("/readings");
        return;
      }
      setParent(r);
      setConcern((r.question ?? "").slice(0, MAX_LEN));
      setClosing(extractClosingLine((d.messages ?? []) as MessageRow[]));
      fetch("/api/stars/balance", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .then((b) => b && setBalance(b.balance ?? 0))
        .catch(() => {});
    })();
  }, [router, readingId]);

  if (error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-5 text-center">
        <p className="text-[14px] text-text-light mb-4">{error}</p>
        <Link href="/readings" className="px-6 py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px]">
          내 고민톡으로
        </Link>
      </main>
    );
  }
  if (!parent) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  const consultationType = (parent.consultationType as "saju" | "tarot") ?? "saju";
  const fullCost = fullCostFor({ consultationType, spreadType: parent.spreadType });
  const deepCost = continuationPrice(fullCost, "deep");

  const start = async (mode: "fresh" | "deep") => {
    if (concern.length < MIN_LEN) {
      setError(`고민을 ${MIN_LEN}자 이상 적어줘`);
      return;
    }
    const cost = mode === "fresh" ? fullCost : deepCost;
    if (balance !== null && balance < cost) {
      router.push("/shop");
      return;
    }
    setError(null);

    // tarot-fresh: 새 카드 추첨 필요 → 마커 심고 타로 흐름으로
    if (consultationType === "tarot" && mode === "fresh") {
      sessionStorage.setItem(
        "byeolkong:continuation",
        JSON.stringify({ previousReadingId: parent.id, mode: "fresh" })
      );
      sessionStorage.setItem(
        "byeolkong:pending_consultation",
        JSON.stringify({ emotion: parent.emotionTag ?? "", concern, type: "tarot" })
      );
      router.push("/tarot");
      return;
    }

    // 서버 복사 경로
    setSubmitting(true);
    try {
      const res = await fetch("/api/readings/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previousReadingId: parent.id, mode, concern }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.code === "INSUFFICIENT_STARS") {
          router.push("/shop");
          return;
        }
        setError(data?.error || "시작이 안 됐어. 잠시 후 다시 시도해줄래?");
        setSubmitting(false);
        return;
      }
      if (data.consultationType === "tarot") {
        router.push(`/tarot/reading?id=${data.id}`);
      } else {
        router.push(`/saju/reading?id=${data.id}`);
      }
    } catch {
      setError("연결이 잠시 흔들렸어. 다시 시도해줄래?");
      setSubmitting(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center py-10 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <Link href="/readings" className="text-[12px] text-text-light/70">‹ 내 고민톡</Link>
      </div>

      <div className="w-full max-w-md mx-auto px-5 mb-6 flex flex-col items-center">
        <Image src="/byeolkong-main.png" alt="별콩이" width={88} height={88} priority />
        <h1 className="mt-3 font-display text-xl font-bold text-eye-purple text-center">
          이 고민, 이어가볼까?
        </h1>
      </div>

      <div className="w-full max-w-md mx-auto px-5 mb-4 flex flex-col gap-2">
        <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30">
          <div className="text-[11px] font-bold text-text-light mb-1">지난번 고민</div>
          <p className="text-[13px] text-eye-purple leading-relaxed whitespace-pre-wrap">{parent.question}</p>
        </div>
        {closing && (
          <div className="bg-gradient-to-br from-gold-soft/30 via-lilac-soft/60 to-cream-warm rounded-2xl p-4 border border-gold-soft/40">
            <div className="text-[11px] font-bold text-eye-purple mb-1">별콩이 마지막 한마디</div>
            <p className="text-[13px] text-eye-purple leading-relaxed">{closing}</p>
          </div>
        )}
      </div>

      <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-2">
        <label className="text-[12px] text-text-light">이어서 나눌 고민 (수정 가능)</label>
        <textarea
          value={concern}
          onChange={(e) => setConcern(e.target.value.slice(0, MAX_LEN))}
          rows={4}
          className="w-full p-3 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px] leading-relaxed resize-none placeholder:text-text-light/50"
        />
        <div className="flex justify-between text-[11px] text-text-light/70">
          <span>{concern.length < MIN_LEN ? `최소 ${MIN_LEN}자` : " "}</span>
          <span>{concern.length} / {MAX_LEN}</span>
        </div>
        {balance !== null && (
          <div className="text-[11px] text-text-light/80 text-right">내 별 잔액: {balance}별</div>
        )}
        {error && <p className="text-[12px] text-red-500 text-center">{error}</p>}

        <button
          onClick={() => start("fresh")}
          disabled={submitting || concern.length < MIN_LEN}
          className="mt-2 w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ✨ 새로 펼쳐 이어보기 (⭐ {fullCost})
        </button>
        <button
          onClick={() => start("deep")}
          disabled={submitting || concern.length < MIN_LEN}
          className="w-full py-3.5 rounded-xl border border-lilac-deep/50 text-lilac-deep font-bold text-[15px] hover:bg-lilac-deep/5 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          🔍 같은 결로 더 깊이 (⭐ {deepCost}
          <span className="text-[11px] text-lilac-deep/70">40% 할인</span>)
        </button>
      </div>
    </main>
  );
}
