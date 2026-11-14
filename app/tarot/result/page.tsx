"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ConcernQuote from "@/components/tarot/ConcernQuote";
import Image from "next/image";
import ChatBubble from "@/components/tarot/ChatBubble";
import EmphasisText from "@/components/common/EmphasisText";
import { parseIntoBubbles } from "@/lib/tarot/bubbles";
import TarotShareButtons from "@/components/tarot/TarotShareButtons";
import ResultUpsell from "@/components/upsell/ResultUpsell";
import { EMOTION_TO_CATEGORY } from "@/lib/tarot/spreads";
import type { EmotionTag } from "@/lib/emotions";
import RevisitSheet from "@/components/push/RevisitSheet";
import SurveyResultCard from "@/components/survey/SurveyResultCard";
import { extractClosingLine } from "@/lib/saju/closing";
import { stripRecoMarkers } from "@/lib/reco-utils";
import { getCard, getCardImagePath } from "@/lib/tarot/cards";
import { SPREAD_INFO } from "@/lib/tarot/spreads";
import type { SpreadType, DrawnCard } from "@/lib/tarot/spreads";
import { EMOTION_OPTIONS, PENDING_KEY } from "@/lib/emotions";
import { CONTINUATION_KEY } from "@/lib/tarot/session";
import { redrawCard, redrawTarget } from "@/lib/tarot/redraw";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { tarotPrice } from "@/lib/tarot/pricing";
import Icon from "@/components/common/Icon";

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
  const [isOwner, setIsOwner] = useState(false);

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
        const owner = r.ok; // 첫 조회 성공 = 소유자 (공개 폴백 아님)
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
        if (owner) {
          setIsOwner(true);
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
        <p className="text-14 text-text-light mb-4">{error}</p>
        <Link
          href="/tarot"
          className="btn btn-primary btn-md"
        >
          새 카드 뽑으러 가기
        </Link>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-14">결과 불러오는 중…</p>
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
  // 끊긴 대화의 '이어서 대화하기'는 뺐다 — 결과 화면에 오면 결과로 끝(디자인 다듬기 /tarot/result ⑤ 운영자 11-14, 쓰임 7%)
  // 공유 링크로 온 남(비소유자)에게 남의 고민을 넘기지 않는다 — 자기 고민 적기로
  const redraw = isOwner
    ? redrawTarget(reading.question, reading.emotionTag)
    : { href: "/concern", pending: null };
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
    // selectable — 앱에서도 결과 본문은 복사할 수 있게(버튼·링크는 globals.css 가 다시 막는다)
    <main className="selectable flex flex-1 flex-col items-center py-10 w-full animate-fade-in">
      {reading.relationshipId && (
        <div className="w-full max-w-md mx-auto px-5 mb-4">
          <Link
            href="/relationship"
            className="btn btn-secondary btn-lg"
          >
            연애 상담으로 돌아가 이어 얘기하기
          </Link>
        </div>
      )}

      {/* 고민 분류 + 나의 고민 */}
      <div className="w-full max-w-md mx-auto px-5 mb-6">
        {/* 맨 위 — 큰 감정 아이콘 하나 + 다른 화면과 같은 제목(로고 글꼴 20) + 날짜·스프레드 한 줄(C안) — 디자인 다듬기 /tarot/result ① 운영자 11-14.
            옛 양옆 아이콘 두 개·오른쪽 위 날짜·웹 '‹ 홈으로'(로고·아래 탭이 같은 일)는 뺐다 */}
        {emotionIcon && (
          <Image src={emotionIcon} alt="" width={52} height={52} className="mx-auto mb-2" />
        )}
        {reading.emotionTag && (
          <h1 className="font-display text-20 text-eye-purple text-center text-balance break-keep">
            {reading.emotionTag}
          </h1>
        )}
        <p className="text-13 text-text-light text-center mt-1 mb-4">
          {(() => {
            const d = new Date(reading.createdAt);
            return `${d.getMonth() + 1}월 ${d.getDate()}일 · ${spreadLabel}`;
          })()}
        </p>
        <ConcernQuote text={reading.question} />
      </div>

      {/* 뽑은 카드 스프레드 */}
      <div className="w-full max-w-md mx-auto px-5">
        <div className="bg-night rounded-2xl p-5 border border-lilac-mid/20">
          <div className="flex flex-wrap justify-center gap-4">
            {cards.map((c, i) => {
              const card = getCard(c.card_id);
              // 카드 이름이 먼저(굵게), 자리 이름은 아래 작게 — 옛 판은 자리 이름이 크고 카드 이름이 작았다. 정/역 글자는 뺐다(역방향은 그림이 뒤집혀 보인다).
              // 1장이면 대화 화면 판과 같은 104×164 로 키운다 — 디자인 다듬기 /tarot/result ③ 운영자 11-14
              const one = cards.length === 1;
              return (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className={`relative ${one ? "w-[104px] h-[164px]" : "w-[88px] aspect-[2/3]"} rounded-lg overflow-hidden border border-card-gold/50`}>
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
                  <div className="text-center max-w-[104px]">
                    <p className="text-14 font-bold text-white leading-tight">{card?.name_kr}</p>
                    <p className="text-11 text-white/60 leading-tight mt-1">{c.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 별콩이가 전하는 한마디 */}
      {closingLine && (
        <div className="w-full max-w-md mx-auto px-5 mt-4">
          {/* ❝ 장식 뺌 · ** 를 대화 말풍선과 같은 강조로 · 본문 15 — 디자인 다듬기 /tarot/result ④ 운영자 A안 11-14 */}
          <div className="bg-white rounded-2xl shadow-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Image
                src="/byeolkong-cheer.png"
                alt="별콩이"
                width={28}
                height={28}
              />
              <span className="text-12 font-bold text-eye-purple">
                별콩이가 전하는 한마디
              </span>
            </div>
            <p className="text-15 text-eye-purple leading-relaxed">
              <EmphasisText text={closingLine} />
            </p>
          </div>
        </div>
      )}

      {/* 대화 다시보기 */}
      <div className="w-full max-w-md mx-auto px-5 mt-4">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="btn btn-secondary btn-lg"
        >
          대화 전체 다시보기 <Icon name="chev_d" size={14} className={showHistory ? "rotate-180" : ""} />
        </button>
        {showHistory && (
          <div className="card mt-3">
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


      {/* ② 다음 — '이 고민으로 카드 다시 뽑기'를 추천 묶음 맨 위에 같은 무게로(디자인 다듬기 /tarot/result ③ M2, 운영자 11-14).
          예전엔 재충전 블록의 보라 버튼이었다. 가격 = 가장 싼 스프레드(원카드)부터. 계측은 그때와 같은 cta:"new" */}
      <ResultUpsell
        variant="counsel"
        topic={EMOTION_TO_CATEGORY[reading.emotionTag as EmotionTag] ?? "default"}
        title="다음엔 뭐 볼래?"
        lead={{
          ...redrawCard(redraw.href, tarotPrice("one_card")),
          onClick: () => {
            trackUiEvent("result_cta_clicked", { readingId: reading.id, meta: { cta: "new" } });
            // 이 고민을 넘긴다 — 고민 적기와 같이, 남은 이어가기 표시는 지운다(새 리딩에 옛 요약이 붙지 않게)
            sessionStorage.removeItem(CONTINUATION_KEY);
            if (redraw.pending) sessionStorage.setItem(PENDING_KEY, JSON.stringify(redraw.pending));
          },
        }}
      />

      {/* 다시 볼 날 — 소유자·앱에서만(공유 위) */}
      {isOwner && <RevisitSheet readingId={reading.id} autoOpen={!reading.hasSensitive} />}

      {/* ④ 공유 — 크로스셀 아래로 */}
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

      <SurveyResultCard />
    </main>
  );
}
