"use client";

// 어드민 리딩 상세 — 유저가 실제 보는 결과 화면과 동일하게 렌더.
// DB(readings + messages) 를 props 로 받아 운세/타로/사주 3분기로 기존 프레젠테이션 컴포넌트 재사용.

import Image from "next/image";
import { fortuneTypeFromTag, FORTUNE_CONFIG } from "@/lib/fortune/types";
import DailyReportCard from "@/components/fortune/DailyReportCard";
import MonthlyReportView from "@/components/fortune/monthly/MonthlyReportView";
import SajuFullReportView from "@/components/fortune/saju-full/SajuFullReportView";
import CompatReportView from "@/components/fortune/compat/CompatReportView";
import TarotReportView from "@/components/fortune/TarotReportView";
import SajuBoard from "@/components/saju/SajuBoard";
import ChatBubble from "@/components/saju/ChatBubble";
import TarotChatBubble from "@/components/tarot/ChatBubble";
import { parseIntoBubbles } from "@/lib/tarot/bubbles";
import { tryParseStoredDailyReport } from "@/lib/fortune/daily-report";
import { tryParseStoredMonthlyReport } from "@/lib/fortune/monthly-report";
import { tryParseStoredSajuFullReport } from "@/lib/fortune/saju-full-report";
import { tryParseStoredCompatReport, type CompatSajuPair } from "@/lib/fortune/compat-report";
import { tryParseStoredTarotReport } from "@/lib/fortune/tarot-report";
import { getCard, getCardImagePath } from "@/lib/tarot/cards";
import type { DrawnCard } from "@/lib/tarot/spreads";
import type { SajuResult } from "@/lib/saju/calc";

// 어드민으로 내려오는 DB row (snake_case). 필요한 컬럼만.
export interface AdminReadingRow {
  id: string;
  question: string | null;
  saju_data: unknown;
  consultation_type: string | null;
  emotion_tag: string | null;
  drawn_cards: unknown;
  stars_spent: number | null;
  has_sensitive: boolean | null;
  created_at: string | null;
}

export interface AdminMessageRow {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// 유저 페이지(fortune/result)의 fallback parseSections 와 동일 — 운세 리포트 파싱 실패 시.
interface Section {
  title: string;
  body: string;
}
function parseSections(text: string): Section[] {
  const lines = text.split("\n");
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      if (cur) out.push(cur);
      cur = { title: m[1].trim(), body: "" };
    } else if (cur) {
      cur.body += (cur.body ? "\n" : "") + line;
    } else if (line.trim()) {
      cur = { title: "", body: line };
    }
  }
  if (cur) out.push(cur);
  return out
    .map((s) => ({ title: s.title, body: s.body.trim() }))
    .filter((s) => s.title || s.body);
}

// [RECO:] 마커만 "칩 노출" 배지 텍스트로 치환 — 유저가 그 시점에 뭘 봤는지 확인용(어드민 전용).
// [CARD:n]/[END] 는 남겨서 parseIntoBubbles 가 카드 인터리브·정리하게 둔다.
function recoToBadge(raw: string): string {
  return raw.replace(/\[RECO:([a-z0-9_:]+)\]/gi, "〔🔔 칩 노출: $1〕");
}

// 컴포넌트들이 light 테마라 흰/크림 컨테이너 위에 얹는다.
function LightStage({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-cream rounded-2xl py-8 flex flex-col items-center text-eye-purple">
      {children}
    </div>
  );
}

function RawDump({ messages }: { messages: AdminMessageRow[] }) {
  return (
    <details className="rounded-lg border border-white/10 bg-white/5">
      <summary className="cursor-pointer px-3 py-2 text-xs text-white/60">
        원본 메시지 보기
      </summary>
      <div className="space-y-2 p-3">
        {messages.length === 0 && (
          <div className="text-xs text-white/40">메시지 없음 (생성 중이거나 비어 있음)</div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg p-3 text-sm ${m.role === "user" ? "bg-white/10" : "bg-lilac-deep/30"}`}
          >
            <div className="mb-1 text-[10px] text-white/40">{m.role}</div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
      </div>
    </details>
  );
}

function ChatHistory({
  messages,
  clean,
}: {
  messages: AdminMessageRow[];
  clean: (raw: string) => string;
}) {
  if (messages.length === 0) {
    return (
      <div className="rounded-2xl bg-cream-warm/40 p-4 text-center text-[13px] text-text-light">
        아직 대화가 없어 (생성 중이거나 비어 있음)
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-lilac-mid/20 bg-cream-warm/40 p-3">
      {messages.map((m, i) => (
        <ChatBubble
          key={i}
          role={m.role}
          content={m.role === "assistant" ? clean(m.content) : m.content}
          isFirstInTurn={
            m.role === "assistant" && (i === 0 || messages[i - 1].role !== "assistant")
          }
        />
      ))}
    </div>
  );
}

// 타로 상담 다시보기 — 유저 결과 페이지(tarot/result)와 동일하게 [CARD:n] 마커로
// 카드 이미지·버블 인터리브. [RECO:] 는 배지로 보존(어드민 확인용).
function TarotChatHistory({
  messages,
  drawnCards,
}: {
  messages: AdminMessageRow[];
  drawnCards: DrawnCard[];
}) {
  if (messages.length === 0) {
    return (
      <div className="rounded-2xl bg-cream-warm/40 p-4 text-center text-[13px] text-text-light">
        아직 대화가 없어 (생성 중이거나 비어 있음)
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-lilac-mid/20 bg-cream-warm/40 p-3">
      {messages.map((m, i) => {
        if (m.role === "user") {
          return <TarotChatBubble key={i} role="user" content={m.content} />;
        }
        return (
          <div key={i}>
            {parseIntoBubbles(recoToBadge(m.content)).map((b, bI) => (
              <TarotChatBubble
                key={`${i}-${bI}`}
                role="assistant"
                content={b.text}
                showAvatar={bI === 0}
                showName={bI === 0}
                cardIndex={b.cardIndex}
                showCardImage={b.showCardImage}
                drawnCards={drawnCards}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function ReadingDetailView({
  reading,
  messages,
}: {
  reading: AdminReadingRow;
  messages: AdminMessageRow[];
}) {
  const createdAt = reading.created_at;
  const lastAssistant =
    [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";

  const ft = fortuneTypeFromTag(reading.emotion_tag);

  // ── 분기 1: 운세 (단발 리포트) ──────────────────────────────
  if (ft) {
    const cfg = FORTUNE_CONFIG[ft];
    const report = lastAssistant;

    const dateLabel = createdAt
      ? new Date(createdAt).toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
          timeZone: "Asia/Seoul",
        })
      : null;
    const monthLabel = createdAt
      ? new Date(createdAt).toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          timeZone: "Asia/Seoul",
        })
      : null;

    const isCompat = ft === "compat" || ft === "compat_social";
    const sajuData = (reading.saju_data ?? null) as SajuResult | null;
    const compatSaju = (reading.saju_data ?? null) as CompatSajuPair | null;
    const drawnCards = (reading.drawn_cards ?? []) as DrawnCard[];

    let body: React.ReactNode = null;
    if (!report) {
      body = (
        <div className="px-5 text-center text-[13px] text-text-light">
          아직 리포트가 없어 (생성 중이거나 실패)
        </div>
      );
    } else if (ft === "daily") {
      const r = tryParseStoredDailyReport(report);
      body = r ? <DailyReportCard report={r} dateLabel={dateLabel} /> : null;
    } else if (ft === "monthly") {
      const r = tryParseStoredMonthlyReport(report);
      body = r ? <MonthlyReportView report={r} monthLabel={monthLabel} /> : null;
    } else if (ft === "saju_full") {
      const r = tryParseStoredSajuFullReport(report);
      body = r ? <SajuFullReportView report={r} saju={sajuData} /> : null;
    } else if (isCompat) {
      const r = tryParseStoredCompatReport(report);
      body = r ? (
        <CompatReportView
          report={r}
          saju={compatSaju}
          variant={ft === "compat_social" ? "social" : "romantic"}
        />
      ) : null;
    } else if (cfg.base === "tarot") {
      const r = tryParseStoredTarotReport(report);
      body = r ? (
        <TarotReportView
          report={r}
          drawnCards={drawnCards}
          variant={ft === "tarot_daily" ? "daily" : "default"}
        />
      ) : null;
    }

    // 파싱 실패 → 유저 페이지와 동일한 sections fallback
    if (report && body === null) {
      const sections = parseSections(report);
      body = (
        <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-5">
          {sections.map((s, i) => (
            <div key={i} className="rounded-2xl border border-lilac-mid/30 bg-cream-warm p-4">
              {s.title && (
                <h2 className="mb-2 text-[14px] font-bold text-lilac-deep">{s.title}</h2>
              )}
              {s.body.split(/\n{2,}/).map((p, j) => (
                <p
                  key={j}
                  className="whitespace-pre-line text-[13.5px] leading-relaxed text-text [&:not(:first-child)]:mt-2"
                >
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <LightStage>
          <div className="mb-4 flex flex-col items-center px-5">
            <Image src="/byeolkong-main.png" alt="별콩이" width={72} height={72} />
            <h2 className="mt-1 font-display text-[20px] font-bold text-eye-purple">
              {cfg.emoji} {cfg.label}
            </h2>
            {dateLabel && (
              <p className="mt-1 text-[11.5px] font-medium text-lilac-deep">{dateLabel}</p>
            )}
          </div>
          {body}
        </LightStage>
        <RawDump messages={messages} />
      </div>
    );
  }

  // ── 분기 2: 고민톡 타로 ─────────────────────────────────────
  if (reading.consultation_type === "tarot") {
    const drawnCards = (reading.drawn_cards ?? []) as DrawnCard[];
    return (
      <div className="space-y-3">
        <LightStage>
          <div className="mx-auto mb-6 w-full max-w-md px-5">
            <div className="rounded-2xl border border-lilac-mid/30 bg-cream-warm p-4">
              <div className="mb-1 text-[11px] font-bold text-text-light">나의 고민</div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-eye-purple">
                {reading.question}
              </p>
            </div>
          </div>

          {drawnCards.length > 0 && (
            <div className="mx-auto w-full max-w-md px-5">
              <div className="rounded-2xl border border-lilac-mid/20 bg-night p-5">
                <div className="flex flex-wrap justify-center gap-4">
                  {drawnCards.map((c, i) => {
                    const card = getCard(c.card_id);
                    return (
                      <div key={i} className="flex flex-col items-center gap-2">
                        <div className="relative aspect-[2/3] w-[88px] overflow-hidden rounded-lg border border-card-gold/50 shadow-lg">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getCardImagePath(c.card_id)}
                            alt={card?.name_kr ?? ""}
                            className="h-full w-full object-cover"
                            style={{
                              transform:
                                c.direction === "reversed" ? "rotate(180deg)" : "none",
                            }}
                          />
                        </div>
                        <span className="max-w-[96px] text-center text-[12px] font-extrabold leading-tight text-white">
                          {c.label}
                        </span>
                        <span className="max-w-[96px] text-center text-[11px] leading-tight text-white/90">
                          {card?.name_kr}
                          {c.direction === "reversed" ? " (역)" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="mx-auto mt-4 w-full max-w-md px-5">
            <TarotChatHistory messages={messages} drawnCards={drawnCards} />
          </div>
        </LightStage>
        <RawDump messages={messages} />
      </div>
    );
  }

  // ── 분기 3: 고민톡 사주 ─────────────────────────────────────
  const sajuData = (reading.saju_data ?? null) as SajuResult | null;
  return (
    <div className="space-y-3">
      <LightStage>
        {sajuData && (
          <div className="mb-2 w-full">
            <SajuBoard saju={sajuData} />
          </div>
        )}
        <div className="mx-auto mt-4 w-full max-w-md px-5">
          <div className="rounded-2xl border border-lilac-mid/30 bg-cream-warm p-4">
            <div className="mb-1 text-[11px] font-bold text-text-light">그날의 고민</div>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-eye-purple">
              {reading.question}
            </p>
          </div>
        </div>
        <div className="mx-auto mt-4 w-full max-w-md px-5">
          <ChatHistory
            messages={messages}
            clean={(raw) =>
              raw
                .replace(/\[RECO:([a-z0-9_:]+)\]/gi, "〔🔔 칩 노출: $1〕")
                .replace(/\[END\]\s*$/, "")
                .trim()
            }
          />
        </div>
      </LightStage>
      <RawDump messages={messages} />
    </div>
  );
}
