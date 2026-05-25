"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import SajuBoard from "@/components/saju/SajuBoard";
import ChatBubble from "@/components/saju/ChatBubble";
import ShareButtons from "@/components/saju/ShareButtons";
import { extractClosingLine } from "@/lib/saju/closing";
import type { SajuResult } from "@/lib/saju/calc";

export default function ResultPage() {
  return (
    <Suspense fallback={null}>
      <ResultPageInner />
    </Suspense>
  );
}

interface MessageRow {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface FetchData {
  reading: {
    id: string;
    question: string;
    sajuData: SajuResult;
    starsSpent: number;
    hasSensitive: boolean;
    createdAt: string;
  };
  messages: MessageRow[];
}

function ResultPageInner() {
  const sp = useSearchParams();
  const id = sp.get("id");
  const [data, setData] = useState<FetchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!id) {
      setError("리딩 정보가 없어");
      return;
    }
    void fetch(`/api/readings/${id}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setError(d?.error || "결과를 불러오지 못했어");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) setData(d as FetchData);
      })
      .catch(() => setError("연결이 흔들렸어"));
  }, [id]);

  if (error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-5 text-center">
        <p className="text-[14px] text-text-light mb-4">{error}</p>
        <Link
          href="/saju"
          className="px-6 py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px]"
        >
          새 사주 보러가기
        </Link>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">결과 불러오는 중…</p>
      </main>
    );
  }

  const { reading, messages } = data;
  const closingLine = extractClosingLine(messages);
  const saju = reading.sajuData;

  return (
    <main className="flex flex-1 flex-col items-center py-10 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-5 flex items-center justify-between">
        <Link href="/" className="text-[12px] text-text-light/70">
          ‹ 홈으로
        </Link>
        <div className="text-[11px] text-text-light/60">
          {new Date(reading.createdAt).toLocaleDateString("ko-KR")}
        </div>
      </div>

      <div className="w-full max-w-md mx-auto px-5 mb-6 text-center">
        <h1 className="font-display text-2xl font-bold text-eye-purple">
          별콩이와 나눈 풀이
        </h1>
      </div>

      {/* 사주판 */}
      <SajuBoard saju={saju} />

      {/* 고민 */}
      <div className="w-full max-w-md mx-auto px-5 mt-6">
        <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30">
          <div className="text-[11px] font-bold text-text-light mb-1">
            그날의 고민
          </div>
          <p className="text-[13px] text-eye-purple leading-relaxed whitespace-pre-wrap">
            {reading.question}
          </p>
        </div>
      </div>

      {/* 별콩이가 전하는 한마디 */}
      {closingLine && (
        <div className="w-full max-w-md mx-auto px-5 mt-4">
          <div className="bg-gradient-to-br from-gold-soft/30 via-lilac-soft/60 to-cream-warm rounded-2xl p-5 border border-gold-soft/40 relative overflow-hidden">
            <div className="absolute top-2 left-3 text-gold/40 text-4xl font-serif leading-none">
              ❝
            </div>
            <div className="flex items-center gap-2 mb-2 relative">
              <Image
                src="/byeolkong-main.png"
                alt="별콩이"
                width={28}
                height={28}
              />
              <span className="text-[12px] font-bold text-eye-purple">
                별콩이가 전하는 한마디
              </span>
            </div>
            <p className="text-[14px] text-eye-purple leading-relaxed relative">
              {closingLine}
            </p>
          </div>
        </div>
      )}

      {/* 대화 다시보기 */}
      <div className="w-full max-w-md mx-auto px-5 mt-4">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="w-full py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/30 text-[12px] font-bold text-eye-purple flex items-center justify-center gap-1"
        >
          대화 전체 다시보기 {showHistory ? "▴" : "▾"}
        </button>
        {showHistory && (
          <div className="mt-3 bg-cream-warm/40 rounded-2xl p-3 border border-lilac-mid/20">
            {messages.map((m, i) => (
              <ChatBubble
                key={i}
                role={m.role}
                content={
                  m.role === "assistant"
                    ? m.content.replace(/\[END\]\s*$/, "").trim()
                    : m.content
                }
                isFirstInTurn={
                  m.role === "assistant" &&
                  (i === 0 || messages[i - 1].role !== "assistant")
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="w-full max-w-md mx-auto px-5 mt-6 flex flex-col gap-2.5">
        <ShareButtons
          readingId={reading.id}
          question={reading.question}
          dayStem={saju.dayStem}
          dayElement={saju.dayElement}
          closingLine={closingLine}
          hasSensitive={reading.hasSensitive}
        />
        <Link
          href="/saju"
          className="w-full py-3 rounded-xl border border-lilac-deep/40 text-lilac-deep font-bold text-[14px] text-center hover:bg-lilac-deep/5 transition"
        >
          새 사주 보러가기
        </Link>
      </div>
    </main>
  );
}
