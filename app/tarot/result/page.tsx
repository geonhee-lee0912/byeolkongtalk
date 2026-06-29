"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ChatBubble from "@/components/saju/ChatBubble";
import TarotShareButtons from "@/components/tarot/TarotShareButtons";
import { extractClosingLine } from "@/lib/saju/closing";
import { getCard, getCardImagePath } from "@/lib/tarot/cards";
import { SPREAD_INFO } from "@/lib/tarot/spreads";
import type { SpreadType, DrawnCard } from "@/lib/tarot/spreads";
import { EMOTION_OPTIONS } from "@/lib/emotions";

export default function TarotResultPage() {
  return (
    <Suspense fallback={null}>
      <TarotResultInner />
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
    consultationType: string;
    spreadType: SpreadType;
    emotionTag: string | null;
    drawnCards: DrawnCard[] | null;
    starsSpent: number;
    hasSensitive: boolean;
    createdAt: string;
  };
  messages: MessageRow[];
}

// 저장된 assistant 메시지에는 [CARD:n] / [END] 마커가 섞여 있음 — 표시 전 제거
const MARKER_RE = /\[CARD:\d+\]/g;
function cleanContent(raw: string): string {
  return raw.replace(MARKER_RE, "").replace(/\[END\]\s*$/, "").trim();
}

function TarotResultInner() {
  const sp = useSearchParams();
  const id = sp.get("id");
  const [data, setData] = useState<FetchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showBackGuide, setShowBackGuide] = useState(false);

  // 결과 페이지에서 뒤로가기 시 — 진행 중이던 대화창으로 돌아갈 수 없으니
  // 빈 history state 를 하나 쌓아두고 popstate 를 가로채 안내 오버레이를 띄운다.
  useEffect(() => {
    window.history.pushState({ tarotResult: true }, "");
    const onPop = () => {
      setShowBackGuide(true);
      window.history.pushState({ tarotResult: true }, "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!id) {
      setError("리딩 정보가 없어");
      return;
    }
    void (async () => {
      try {
        let r = await fetch(`/api/readings/${id}`, { cache: "no-store" });
        // 비로그인 또는 비소유자(공유 링크) — 공개 조회로 폴백
        if (r.status === 401 || r.status === 403) {
          r = await fetch(`/api/readings/${id}/public`, { cache: "no-store" });
        }
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          setError(d?.error || "결과를 불러오지 못했어");
          return;
        }
        const d = await r.json();
        setData(d as FetchData);
      } catch {
        setError("연결이 흔들렸어");
      }
    })();
  }, [id]);

  if (error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-5 text-center">
        <p className="text-[14px] text-text-light mb-4">{error}</p>
        <Link
          href="/tarot"
          className="px-6 py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px]"
        >
          새 카드 뽑으러 가기
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

  const { reading } = data;
  // 마커 제거한 메시지로 통일 (한마디 추출 + 다시보기 둘 다)
  const messages = data.messages.map((m) => ({
    ...m,
    content: m.role === "assistant" ? cleanContent(m.content) : m.content,
  }));
  const closingLine = extractClosingLine(messages, { excludeInvite: true });
  const cards = reading.drawnCards ?? [];
  const cardsText = cards
    .map((c) => {
      const card = getCard(c.card_id);
      const dir = c.direction === "reversed" ? " (역)" : "";
      return `· ${c.label}: ${card?.name_kr ?? ""}${dir}`;
    })
    .join("\n");
  const spreadLabel = SPREAD_INFO[reading.spreadType]?.label ?? "타로 풀이";
  const emotionIcon = EMOTION_OPTIONS.find(
    (o) => o.tag === reading.emotionTag
  )?.icon;

  return (
    <main className="flex flex-1 flex-col items-center py-10 w-full animate-fade-in">
      {showBackGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-night/60 backdrop-blur-sm px-6 animate-fade-in">
          <div className="w-full max-w-xs bg-cream rounded-2xl p-6 border border-lilac-mid/30 text-center shadow-xl">
            <div className="text-3xl mb-2">🌙</div>
            <h2 className="text-[15px] font-bold text-eye-purple mb-2">
              나눈 대화는 여기까지야
            </h2>
            <p className="text-[12.5px] text-text-light leading-relaxed mb-5">
              방금 나눈 대화창으로는 다시 돌아갈 수 없어.
              <br />
              지난 풀이는 <b className="text-eye-purple">내 고민톡</b>에서 언제든
              다시 볼 수 있어.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href="/readings"
                className="w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[13px]"
              >
                내 고민톡으로 가기
              </Link>
              <Link
                href="/"
                className="w-full py-3 rounded-xl border border-lilac-deep/40 text-lilac-deep font-bold text-[13px]"
              >
                고민 상담하러 가기
              </Link>
              <button
                onClick={() => setShowBackGuide(false)}
                className="w-full py-2 text-[12px] text-text-light/70"
              >
                결과 계속 보기
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="w-full max-w-md mx-auto px-5 mb-5 flex items-center justify-between">
        <Link href="/" className="text-[12px] text-text-light/70">
          ‹ 홈으로
        </Link>
        <div className="text-[11px] text-text-light/60">
          {new Date(reading.createdAt).toLocaleDateString("ko-KR")}
        </div>
      </div>

      {/* 고민 분류 + 나의 고민 */}
      <div className="w-full max-w-md mx-auto px-5 mb-6">
        {reading.emotionTag && (
          <h1 className="text-xl font-bold text-eye-purple flex items-center justify-center gap-2 mb-7">
            {emotionIcon && (
              <Image
                src={emotionIcon}
                alt=""
                width={36}
                height={36}
                className="shrink-0"
              />
            )}
            {reading.emotionTag}
            {emotionIcon && (
              <Image
                src={emotionIcon}
                alt=""
                width={36}
                height={36}
                className="shrink-0"
              />
            )}
          </h1>
        )}
        <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30">
          <div className="text-[11px] font-bold text-text-light mb-1">
            나의 고민
          </div>
          <p className="text-[13px] text-eye-purple leading-relaxed whitespace-pre-wrap">
            {reading.question}
          </p>
        </div>
      </div>

      {/* 뽑은 카드 스프레드 */}
      <div className="w-full max-w-md mx-auto px-5">
        <div className="bg-night rounded-2xl p-5 border border-lilac-mid/20">
          <div className="flex flex-wrap justify-center gap-4">
            {cards.map((c, i) => {
              const card = getCard(c.card_id);
              return (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="relative w-[88px] aspect-[2/3] rounded-lg overflow-hidden border border-card-gold/50 shadow-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getCardImagePath(c.card_id)}
                      alt={card?.name_kr ?? ""}
                      className="w-full h-full object-cover"
                      style={{
                        transform:
                          c.direction === "reversed" ? "rotate(180deg)" : "none",
                      }}
                    />
                  </div>
                  <span className="text-[12px] font-extrabold text-white leading-tight text-center max-w-[96px]">
                    {c.label}
                  </span>
                  <span className="text-[11px] text-white/90 leading-tight text-center max-w-[96px]">
                    {card?.name_kr}
                    {c.direction === "reversed" ? " (역)" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 별콩이가 전하는 한마디 */}
      {closingLine && (
        <div className="w-full max-w-md mx-auto px-5 mt-4">
          <div className="bg-gradient-to-br from-gold-soft/30 via-lilac-soft/60 to-cream-warm rounded-2xl p-5 relative overflow-hidden">
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
                content={m.content}
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
        <TarotShareButtons
          readingId={reading.id}
          question={reading.question}
          spreadLabel={spreadLabel}
          cardsText={cardsText}
          closingLine={closingLine}
          hasSensitive={reading.hasSensitive}
        />
        {!reading.hasSensitive && (
          <Link
            href={`/continue/${reading.id}`}
            className="w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] text-center hover:bg-lilac-deep/90 transition"
          >
            이 고민 이어가기 →
          </Link>
        )}
        <Link
          href="/tarot"
          className="w-full py-3 rounded-xl border border-lilac-deep/40 text-lilac-deep font-bold text-[14px] text-center hover:bg-lilac-deep/5 transition"
        >
          새 카드 뽑으러 가기
        </Link>
      </div>
    </main>
  );
}
