"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { fortuneTypeFromTag, FORTUNE_CONFIG } from "@/lib/fortune/types";
import { SPREAD_INFO, type DrawnCard } from "@/lib/tarot/spreads";
import { getCardImagePath } from "@/lib/tarot/cards";
import { SAJU_PRODUCT_INFO, isSajuProduct } from "@/lib/saju/products";

interface ReadingItem {
  id: string;
  question: string;
  sajuData: {
    dayStem?: string;
    dayElement?: string;
    pillars?: { day?: { stem: string; branch: string } };
  } | null;
  consultationType?: string;
  spreadType?: string | null;
  sajuProduct?: string | null;
  drawnCards?: DrawnCard[] | null;
  emotionTag?: string | null;
  starsSpent: number;
  hasSensitive: boolean;
  createdAt: string;
  ended?: boolean;
  profile: { display_name: string; relation_type: string } | null;
}

const READINGS_TABS = [
  { key: "consult", label: "고민 상담" },
  { key: "fortune", label: "별콩 운세" },
] as const;

type ReadingsTab = (typeof READINGS_TABS)[number]["key"];

/** 고민 상담 카드의 '운세 선택' 라벨 — 타로 스프레드 또는 사주 상품 */
function choiceLabel(r: ReadingItem): string | null {
  if (r.consultationType === "tarot" && r.spreadType) {
    return (SPREAD_INFO as Record<string, { label: string }>)[r.spreadType]?.label ?? null;
  }
  if (isSajuProduct(r.sajuProduct)) {
    return SAJU_PRODUCT_INFO[r.sajuProduct].label;
  }
  return null;
}

/** 사주 상담 카드의 일주 (일간+일지, 예: "갑자") — 없으면 null */
function dayPillar(r: ReadingItem): string | null {
  const d = r.sajuData?.pillars?.day;
  return d ? `${d.stem}${d.branch}` : null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function ReadingsPage() {
  const router = useRouter();
  const [readings, setReadings] = useState<ReadingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ReadingsTab>("consult");

  useEffect(() => {
    void (async () => {
      const [me, list] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        fetch("/api/readings", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
      ]);
      if (!me?.isAuthenticated) {
        router.replace("/login?next=/readings");
        return;
      }
      if (list?.readings) setReadings(list.readings);
      setLoading(false);
    })();
  }, [router]);

  const { consult, fortune } = useMemo(() => {
    const consult: ReadingItem[] = [];
    const fortune: ReadingItem[] = [];
    for (const r of readings) {
      if (fortuneTypeFromTag(r.emotionTag)) fortune.push(r);
      else consult.push(r);
    }
    return { consult, fortune };
  }, [readings]);

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  const items = tab === "consult" ? consult : fortune;

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-4">
        <h1 className="text-[18px] font-bold text-eye-purple">내 고민톡</h1>
        <p className="text-[12px] text-text-light/70 mt-1">
          별콩이와 나눈 상담과 운세를 다시 볼 수 있어
        </p>
      </div>

      <div className="w-full max-w-md mx-auto px-5 mb-4">
        <div className="flex gap-1 bg-lilac-soft/40 rounded-full p-1">
          {READINGS_TABS.map((t) => {
            const count = t.key === "consult" ? consult.length : fortune.length;
            return (
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
                {t.label} {count > 0 && <span className="text-[12px]">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-full max-w-md mx-auto px-5">
        {items.length === 0 ? (
          <div className="bg-cream-warm rounded-2xl p-6 border border-lilac-mid/30 text-center">
            <p className="text-[13px] text-text-light leading-relaxed">
              {tab === "consult" ? (
                <>
                  아직 상담 기록이 없어.
                  <br />첫 고민을 별콩이랑 풀어볼까?
                </>
              ) : (
                <>
                  아직 본 운세가 없어.
                  <br />별콩 운세를 펼쳐볼까?
                </>
              )}
            </p>
            <Link
              href={tab === "consult" ? "/concern" : "/fortune"}
              className="mt-3 inline-block px-5 py-2 rounded-xl bg-lilac-deep text-white text-[12px] font-bold"
            >
              {tab === "consult" ? "고민 상담 하러가기" : "운세 보러가기"}
            </Link>
          </div>
        ) : tab === "consult" ? (
          <div className="flex flex-col gap-2">
            {items.map((r) => {
              const isTarot = r.consultationType === "tarot";
              const canResume = isTarot && r.ended === false;
              const href = canResume
                ? `/tarot/reading?id=${r.id}`
                : isTarot
                  ? `/tarot/result?id=${r.id}`
                  : `/saju/result?id=${r.id}`;
              const choice = choiceLabel(r);
              const cards = r.drawnCards ?? [];
              const pillar = dayPillar(r);
              return (
                <Link
                  key={r.id}
                  href={href}
                  className="bg-cream-warm rounded-2xl p-3.5 border border-lilac-mid/30 flex gap-3 hover:border-lilac-deep/50 transition"
                >
                  {isTarot ? (
                    cards.length > 0 ? (
                      <div className="shrink-0 self-center flex items-center">
                        {cards.map((c, i) => (
                          <Image
                            key={i}
                            src={getCardImagePath(c.card_id)}
                            alt=""
                            width={28}
                            height={44}
                            style={{ marginLeft: i === 0 ? 0 : -16, zIndex: i }}
                            className={`rounded-[3px] border border-white/90 shadow-sm ${
                              c.direction === "reversed" ? "rotate-180" : ""
                            }`}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="shrink-0 self-center w-11 h-11 rounded-xl bg-lilac-soft/50 flex items-center justify-center text-[18px]">
                        🃏
                      </div>
                    )
                  ) : (
                    <div className="shrink-0 self-center w-11 h-11 rounded-xl bg-lilac-soft/50 flex flex-col items-center justify-center">
                      {pillar ? (
                        <>
                          <span className="text-[15px] font-bold text-eye-purple leading-none">
                            {pillar}
                          </span>
                          <span className="text-[9px] text-text-light/60 mt-0.5">일주</span>
                        </>
                      ) : (
                        <span className="text-[18px]">🔮</span>
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {canResume && (
                        <span className="shrink-0 text-[10px] font-bold text-white bg-lilac-deep rounded-full px-2 py-0.5">
                          이어하기
                        </span>
                      )}
                      <span className="text-[13px] font-bold text-eye-purple">
                        {r.emotionTag ?? "고민 상담"}
                      </span>
                      {choice && (
                        <span className="text-[11px] text-text-light/60">· {choice}</span>
                      )}
                    </div>
                    <p className="text-[12px] text-text-light/80 mt-1 leading-snug line-clamp-3">
                      {r.question}
                    </p>
                    <div className="text-[11px] text-text-light/60 mt-1.5 flex items-center gap-1.5">
                      <span>{formatDate(r.createdAt)}</span>
                      <span>·</span>
                      <span>{isTarot ? "타로" : "사주"}</span>
                      <span>·</span>
                      <span>⭐ {r.starsSpent}</span>
                      {r.hasSensitive && (
                        <>
                          <span>·</span>
                          <span className="text-rose-400">🤍</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-text-light/40 text-sm self-center">›</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((r) => {
              const fortuneType = fortuneTypeFromTag(r.emotionTag);
              const icon = fortuneType ? FORTUNE_CONFIG[fortuneType].emoji : "✨";
              return (
                <Link
                  key={r.id}
                  href={`/fortune/result?id=${r.id}`}
                  className="bg-cream-warm rounded-2xl p-3.5 border border-lilac-mid/30 flex items-center gap-3 hover:border-lilac-deep/50 transition"
                >
                  <div className="w-10 h-10 rounded-lg bg-gold-soft/30 flex items-center justify-center text-[18px]">
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-eye-purple line-clamp-1 font-medium">
                      {r.question}
                    </div>
                    <div className="text-[11px] text-text-light/70 mt-0.5 flex items-center gap-1.5">
                      <span>{formatDate(r.createdAt)}</span>
                      <span>·</span>
                      <span>{r.starsSpent === 0 ? "무료" : `⭐ ${r.starsSpent}`}</span>
                    </div>
                  </div>
                  <span className="text-text-light/40 text-sm">›</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
