"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { fortuneTypeFromTag, FORTUNE_CONFIG } from "@/lib/fortune/types";
import { SPREAD_INFO, type DrawnCard } from "@/lib/tarot/spreads";
import { getCardImagePath } from "@/lib/tarot/cards";
import { SAJU_PRODUCT_INFO, isSajuProduct } from "@/lib/saju/products";
import RedHorseIcon from "@/components/fortune/RedHorseIcon";
import { readPendingFortune, clearPendingFortune, type PendingFortune } from "@/lib/fortune/pending";

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

const PAGE_SIZE = 8;

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

/** 운세 종류별 아이콘 — saju_full 은 붉은 말, 나머지는 이모지 */
function fortuneIcon(emotionTag: string | null | undefined, size: number) {
  const ft = fortuneTypeFromTag(emotionTag);
  if (ft === "saju_full") return <RedHorseIcon size={size} />;
  return <span>{ft ? FORTUNE_CONFIG[ft].emoji : "✨"}</span>;
}

function DeleteButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="삭제"
      className="absolute top-1.5 right-1.5 p-1 rounded-md text-text-light/30 hover:text-rose-400 hover:bg-rose-50 transition"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    </button>
  );
}

export default function ReadingsPage() {
  const router = useRouter();
  const [readings, setReadings] = useState<ReadingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ReadingsTab>("consult");
  const [page, setPage] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState<PendingFortune | null>(null);

  const loadReadings = async () => {
    const list = await fetch("/api/readings", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    if (list?.readings) setReadings(list.readings);
  };

  useEffect(() => {
    void (async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (!me?.isAuthenticated) {
        router.replace("/login?next=/readings");
        return;
      }
      await loadReadings();
      setPending(readPendingFortune());
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

  // 생성 중 마커가 이미 목록에 반영됐는지
  const pendingResolved = useMemo(() => {
    if (!pending) return true;
    const tag = FORTUNE_CONFIG[pending.type].emotionTag;
    const afterMs = new Date(pending.after).getTime();
    return fortune.some(
      (r) => r.emotionTag === tag && new Date(r.createdAt).getTime() >= afterMs
    );
  }, [pending, fortune]);

  // 생성 완료를 폴링으로 따라잡아 placeholder → 실제 카드로 교체
  useEffect(() => {
    if (!pending || pendingResolved) {
      if (pending && pendingResolved) {
        clearPendingFortune();
        setPending(null);
      }
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const MAX = 40; // 약 2.5분

    const tick = async () => {
      if (cancelled) return;
      const d = await fetch(
        `/api/fortune/recent?type=${encodeURIComponent(pending.type)}&after=${encodeURIComponent(pending.after)}`,
        { cache: "no-store" }
      )
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (cancelled) return;
      if (d?.id) {
        await loadReadings();
        clearPendingFortune();
        setPending(null);
      }
    };

    void tick();
    const timer = setInterval(() => {
      attempts += 1;
      if (attempts >= MAX) {
        clearInterval(timer);
        return;
      }
      void tick();
    }, 4000);

    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pending, pendingResolved]);

  const handleDelete = async (id: string) => {
    setDeleting(true);
    const r = await fetch(`/api/readings/${id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) setReadings((prev) => prev.filter((x) => x.id !== id));
    setDeleteId(null);
    setDeleting(false);
  };

  const switchTab = (t: ReadingsTab) => {
    setTab(t);
    setPage(0);
  };

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  const items = tab === "consult" ? consult : fortune;
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedItems = items.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const showPending = tab === "fortune" && pending && !pendingResolved && safePage === 0;

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
                onClick={() => switchTab(t.key)}
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
        {items.length === 0 && !showPending ? (
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
            {pagedItems.map((r) => {
              const isTarot = r.consultationType === "tarot";
              const canResume = isTarot && r.ended === false;
              const href = canResume
                ? `/tarot/reading?id=${r.id}&from=history`
                : isTarot
                  ? `/tarot/result?id=${r.id}&from=history`
                  : `/saju/result?id=${r.id}&from=history`;
              const choice = choiceLabel(r);
              const cards = r.drawnCards ?? [];
              const pillar = dayPillar(r);
              return (
                <Link
                  key={r.id}
                  href={href}
                  className="relative bg-cream-warm rounded-2xl p-3.5 border border-lilac-mid/30 flex gap-3 hover:border-lilac-deep/50 transition"
                >
                  <DeleteButton
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteId(r.id);
                    }}
                  />
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
                    <div className="flex items-center gap-1.5 flex-wrap pr-5">
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
            {showPending && pending && (
              <div className="bg-cream-warm rounded-2xl p-3.5 border border-lilac-mid/30 flex items-center gap-3 opacity-95">
                <div className="w-10 h-10 rounded-lg bg-gold-soft/30 flex items-center justify-center text-[18px]">
                  {fortuneIcon(FORTUNE_CONFIG[pending.type].emotionTag, 24)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-eye-purple font-medium line-clamp-1">
                    {FORTUNE_CONFIG[pending.type].label}
                  </div>
                  <div className="text-[11px] text-text-light/70 mt-1 flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-lilac-mid/40 border-t-lilac-deep animate-spin" />
                    별콩이가 리포트를 만들고 있어…
                  </div>
                </div>
              </div>
            )}
            {pagedItems.map((r) => (
              <Link
                key={r.id}
                href={`/fortune/result?id=${r.id}&from=history`}
                className="relative bg-cream-warm rounded-2xl p-3.5 border border-lilac-mid/30 flex items-center gap-3 hover:border-lilac-deep/50 transition"
              >
                <DeleteButton
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleteId(r.id);
                  }}
                />
                <div className="w-10 h-10 rounded-lg bg-gold-soft/30 flex items-center justify-center text-[18px]">
                  {fortuneIcon(r.emotionTag, 24)}
                </div>
                <div className="flex-1 min-w-0 pr-5">
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
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => setPage((n) => Math.max(0, n - 1))}
              disabled={safePage === 0}
              aria-label="이전"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-eye-purple disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                aria-label={`${i + 1}페이지`}
                className={`w-7 h-7 rounded-lg text-[12px] font-bold ${
                  i === safePage
                    ? "bg-lilac-deep text-white"
                    : "text-text-light/70 hover:bg-lilac-soft/50"
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setPage((n) => Math.min(totalPages - 1, n + 1))}
              disabled={safePage === totalPages - 1}
              aria-label="다음"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-eye-purple disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* 삭제 확인 모달 */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-5">
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs">
            <p className="text-[14px] font-bold text-eye-purple mb-2">기록 삭제</p>
            <p className="text-[12px] text-text-light leading-relaxed mb-4">
              이 기록을 삭제할까? 삭제하면 다시 볼 수 없어.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2 rounded-xl border border-lilac-mid text-eye-purple text-[12px]"
              >
                취소
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                disabled={deleting}
                className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-[12px] font-bold disabled:opacity-50"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
