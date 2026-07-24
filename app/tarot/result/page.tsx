"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ChatBubble from "@/components/tarot/ChatBubble";
import { parseIntoBubbles } from "@/lib/tarot/bubbles";
import TarotShareButtons from "@/components/tarot/TarotShareButtons";
import ContinuationModal from "@/components/continuation/ContinuationModal";
import ResultUpsell from "@/components/upsell/ResultUpsell";
import RechargeBlock from "@/components/upsell/RechargeBlock";
import RecoCard from "@/components/reco/RecoCard";
import { extractClosingLine } from "@/lib/saju/closing";
import { stripRecoMarkers } from "@/lib/reco-utils";
import type { NextReco } from "@/lib/reco-utils";
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
    nextReco: NextReco | null;
    createdAt: string;
    relationshipId: string | null;
  };
  messages: MessageRow[];
}

// 저장된 assistant 메시지에는 [CARD:n] / [END] / [RECO:] 마커가 섞여 있음 — 표시 전 제거
const MARKER_RE = /\[CARD:\d+\]/g;
function cleanContent(raw: string): string {
  return stripRecoMarkers(raw.replace(MARKER_RE, "").replace(/\[END\]\s*$/, "")).trim();
}

function TarotResultInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const id = sp.get("id");
  const [data, setData] = useState<FetchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [continueOpen, setContinueOpen] = useState(false);

  // 결과 페이지에서 뒤로가기 → 진행 중이던 대화창으로는 돌아갈 수 없으니 내 고민톡으로 보낸다.
  useEffect(() => {
    window.history.pushState({ tarotResult: true }, "");
    const onPop = () => {
      router.replace("/readings");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [router]);

  useEffect(() => {
    if (!id) {
      setError("리딩 정보가 없어");
      return;
    }
    void (async () => {
      try {
        let r = await fetch(`/api/readings/${id}`, { cache: "no-store" });
        const isOwner = r.ok; // 첫 조회 성공 = 소유자 (공개 폴백 아님)
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
        // 소유자가 결과 화면을 연 경우만 열람 마킹 (완료 퍼널 계량용, fire-and-forget)
        if (isOwner) {
          void fetch(`/api/readings/${id}`, { method: "POST" }).catch(() => {});
        }
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
  // 마커 제거한 메시지 — 한마디 추출용 (다시보기는 원본을 parseIntoBubbles 로 렌더)
  const messages = data.messages.map((m) => ({
    ...m,
    content: m.role === "assistant" ? cleanContent(m.content) : m.content,
  }));
  const closingLine = extractClosingLine(messages, { excludeInvite: true });
  // W3: [END] 없이 증발한(stale) 리딩 — "이어서 대화하기" 보조 버튼 노출용 (strip 전 원본에서 판정)
  const ended = data.messages.some(
    (m) => m.role === "assistant" && m.content.includes("[END]")
  );
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
      <div className="w-full max-w-md mx-auto px-5 mb-5 flex items-center justify-between">
        <Link href="/" className="text-[12px] text-text-light/70">
          ‹ 홈으로
        </Link>
        <div className="text-[11px] text-text-light/60">
          {new Date(reading.createdAt).toLocaleDateString("ko-KR")}
        </div>
      </div>

      {reading.relationshipId && (
        <div className="w-full max-w-md mx-auto px-5 mb-4">
          <Link
            href="/relationship"
            className="w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] text-center flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
          >
            💬 우리 사이로 돌아가 이어 얘기하기
          </Link>
        </div>
      )}

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
                src="/byeolkong-cheer.png"
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
            {data.messages.map((m, i) => {
              if (m.role === "user") {
                return <ChatBubble key={i} role="user" content={m.content} />;
              }
              // 라이브 채팅과 동일하게 [CARD:n] 마커 기준 버블 분할 + 카드 이미지 인터리브
              return (
                <div key={i}>
                  {parseIntoBubbles(m.content).map((b, bI) => (
                    <ChatBubble
                      key={`${i}-${bI}`}
                      role="assistant"
                      content={b.text}
                      showAvatar={bI === 0}
                      showName={bI === 0}
                      cardIndex={b.cardIndex}
                      showCardImage={b.showCardImage}
                      drawnCards={cards}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* W3: 미완료(증발) 리딩 — 대화 복귀 경로 보존 */}
      {!ended && (
        <div className="w-full max-w-md mx-auto px-5 mt-3">
          <Link
            href={`/tarot/reading?id=${reading.id}`}
            className="w-full py-2.5 rounded-xl bg-white border border-lilac-mid/40 text-[12.5px] font-bold text-lilac-deep flex items-center justify-center"
          >
            💬 이어서 대화하기
          </Link>
        </div>
      )}

      {/* ① 추천 카드 — next_reco 있을 때만 */}
      {reading.nextReco && (
        <RecoCard
          reco={reading.nextReco}
          readingId={reading.id}
          question={reading.question}
          emotionTag={reading.emotionTag ?? null}
          hasSensitive={reading.hasSensitive}
          onContinue={() => setContinueOpen(true)}
        />
      )}

      {/* ② 재충전 블록 — 리딩 직후 매출 CTA를 앞세움 */}
      <RechargeBlock
        allowContinue={!reading.hasSensitive}
        onContinue={() => setContinueOpen(true)}
        newHref="/tarot"
        newLabel="새 카드 뽑기"
        newCostLabel="⭐10부터"
      />

      {/* ② 공유 — 아래로 */}
      <div className="w-full max-w-md mx-auto px-5 mt-4">
        <TarotShareButtons
          readingId={reading.id}
          question={reading.question}
          spreadLabel={spreadLabel}
          cardsText={cardsText}
          closingLine={closingLine}
          hasSensitive={reading.hasSensitive}
        />
      </div>

      {/* ③ 무료 크로스셀 — 맨 아래 (보너스는 재충전 블록에서 이미 노출) */}
      <ResultUpsell variant="counsel" showBonus={false} />

      <ContinuationModal
        readingId={continueOpen ? reading.id : null}
        onClose={() => setContinueOpen(false)}
      />
    </main>
  );
}
