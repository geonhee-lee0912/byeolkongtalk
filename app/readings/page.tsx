"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { fortuneTypeFromTag, FORTUNE_CONFIG } from "@/lib/fortune/types";
import { type DrawnCard, type SpreadType, SPREAD_INFO } from "@/lib/tarot/spreads";
import { getCard } from "@/lib/tarot/cards";
import { SAJU_PRODUCT_INFO, isSajuProduct } from "@/lib/saju/products";
import RedHorseIcon from "@/components/fortune/RedHorseIcon";
import ContinuationModal from "@/components/continuation/ContinuationModal";

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
  resultReady?: boolean;
  generating?: boolean;
  profile: { display_name: string; relation_type: string } | null;
  preview?: string | null;
}

const READINGS_TABS = [
  { key: "consult", label: "고민톡" },
  { key: "fortune", label: "사주" },
] as const;

type ReadingsTab = (typeof READINGS_TABS)[number]["key"];


/** 사주 상담 카드의 일주 (일간+일지, 예: "갑자") — 없으면 null */
function dayPillar(r: ReadingItem): string | null {
  const d = r.sajuData?.pillars?.day;
  return d ? `${d.stem}${d.branch}` : null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

/** 상대 시간 — 오늘/어제/N일 전/그 이전은 M/D */
function relativeDate(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const startOf = (d: Date) => {
    const kst = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    return new Date(kst.getFullYear(), kst.getMonth(), kst.getDate()).getTime();
  };
  const days = Math.round((startOf(now) - startOf(then)) / 86400000);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return then.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });
}

/** 사주 행 서브텍스트 — "상품명 · OO 사주 甲子" */
function sajuSubtext(r: ReadingItem): string | null {
  if (!isSajuProduct(r.sajuProduct)) return null;
  const product = SAJU_PRODUCT_INFO[r.sajuProduct].label;
  const who = r.profile?.relation_type === "self" || !r.profile ? "내" : r.profile.display_name;
  const pillar = dayPillar(r);
  return pillar ? `${product} · ${who} 사주 ${pillar}` : product;
}

/** 타로 상담 서브텍스트 — 리딩 방법 · 뽑은 카드 이름 나열 */
function tarotSubtext(r: ReadingItem): string | null {
  const parts: string[] = [];
  const info = r.spreadType ? SPREAD_INFO[r.spreadType as SpreadType] : undefined;
  if (info) parts.push(info.label);
  if (r.drawnCards && r.drawnCards.length > 0) {
    const names = r.drawnCards
      .map((c) => getCard(c.card_id)?.name_kr)
      .filter((n): n is string => !!n);
    if (names.length > 0) parts.push(names.join(", "));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** 프로필 칩 라벨 — 본인이면 숨김(null), 아니면 display_name */
function profileChip(r: ReadingItem): string | null {
  if (!r.profile || r.profile.relation_type === "self") return null;
  return r.profile.display_name;
}

/** 사주 상담 아바타 — 4종 일러스트를 중립 소프트 타일 위에 얹음. 상품 미상이면 fallback */
function sajuAvatar(r: ReadingItem) {
  if (isSajuProduct(r.sajuProduct)) {
    return (
      <div className="shrink-0 self-center w-12 h-12 rounded-xl bg-cream flex items-center justify-center border border-lilac-soft overflow-hidden">
        <Image
          src={`/icons/saju/${r.sajuProduct}.png`}
          alt=""
          width={40}
          height={40}
          className="object-contain"
        />
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="shrink-0 self-center w-12 h-12 rounded-xl bg-lilac-soft/50 flex items-center justify-center text-[18px]">
      🔮
    </div>
  );
}

/** 운세 종류별 아이콘 — saju_full 은 붉은 말, 나머지는 이모지 */
function fortuneIcon(emotionTag: string | null | undefined, size: number) {
  const ft = fortuneTypeFromTag(emotionTag);
  if (ft === "saju_full") return <RedHorseIcon size={size} />;
  return <span>{ft ? FORTUNE_CONFIG[ft].emoji : "✨"}</span>;
}

export default function ReadingsPage() {
  const router = useRouter();
  const [readings, setReadings] = useState<ReadingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ReadingsTab>("consult");
  const [continueId, setContinueId] = useState<string | null>(null);

  const loadReadings = async () => {
    const list = await fetch("/api/readings", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    if (list?.readings) setReadings(list.readings);
  };

  useEffect(() => {
    void (async () => {
      const [me] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        loadReadings(),
      ]);
      if (!me?.isAuthenticated) {
        router.replace("/login?next=/readings");
        return;
      }
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

  // 백그라운드 생성 중인 리딩(메시지 없음)이 있으면 완료될 때까지 목록을 폴링.
  const hasGenerating = useMemo(() => fortune.some((r) => r.generating), [fortune]);
  useEffect(() => {
    if (!hasGenerating) return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (cancelled) return;
      void loadReadings();
    }, 3000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadReadings();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hasGenerating]);

  const switchTab = (t: ReadingsTab) => {
    setTab(t);
  };

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
        <Link
          href="/mypage"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-text-light/70 hover:text-lilac-deep transition-colors mb-2"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="11.5 3 5 9 11.5 15" />
          </svg>
          <span>뒤로</span>
        </Link>
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
                    ? "bg-white text-eye-purple shadow-sm"
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
          <div className="bg-white rounded-2xl p-6 border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] text-center">
            <Image
              src="/byeolkong-curious.png"
              alt=""
              width={88}
              height={88}
              className="mx-auto mb-3"
              aria-hidden
            />
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
              // W3: stale 미완료 리딩(resultReady)은 결과 화면으로 — 증발 리딩도 추천/공유/이어가기 노출
              const canResume = r.ended === false && !r.resultReady;
              const href = canResume
                ? isTarot
                  ? `/tarot/reading?id=${r.id}&from=history`
                  : `/saju/reading?id=${r.id}&from=history`
                : isTarot
                  ? `/tarot/result?id=${r.id}&from=history`
                  : `/saju/result?id=${r.id}&from=history`;
              const subParts = [relativeDate(r.createdAt)];
              if (isTarot) {
                const t = tarotSubtext(r);
                if (t) subParts.push(t);
              } else {
                const s = sajuSubtext(r);
                if (s) subParts.push(s);
              }
              const subtitle = subParts.join(" · ");
              const chip = profileChip(r);
              const preview = r.preview?.trim();
              return (
                <div key={r.id} className="relative">
                  <Link
                    href={href}
                    className="bg-white rounded-2xl p-3.5 border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] flex gap-3 items-start hover:border-lilac-deep/50 transition"
                  >
                  {isTarot ? (
                    <div className="shrink-0 self-center w-12 h-12 rounded-xl bg-cream flex items-center justify-center border border-lilac-soft overflow-hidden">
                      <Image
                        src="/icons/tarot.png"
                        alt=""
                        width={40}
                        height={40}
                        className="object-contain"
                      />
                    </div>
                  ) : (
                    sajuAvatar(r)
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13.5px] font-bold text-eye-purple whitespace-nowrap">
                        {r.emotionTag ?? "고민 상담"}
                      </span>
                      {r.hasSensitive && (
                        <span
                          className="shrink-0 text-[11px] text-rose-400"
                          role="img"
                          aria-label="민감 시그널이 감지된 대화"
                        >
                          🤍
                        </span>
                      )}
                      {chip && (
                        <span className="shrink-0 text-[10px] font-bold text-lilac-deep bg-lilac-soft rounded-full px-1.5 py-0.5">
                          {chip}
                        </span>
                      )}
                      {canResume && (
                        <span className="shrink-0 text-[10px] font-bold text-white bg-lilac-deep rounded-full px-1.5 py-0.5">
                          이어하기
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-text-light/60 mt-0.5 leading-snug line-clamp-2">
                      {subtitle}
                    </p>
                    <p className="text-[11.5px] text-text-light/80 mt-1 leading-snug line-clamp-2">
                      {preview || (r.generating ? "별콩이가 답을 준비하고 있어…" : r.question)}
                    </p>
                  </div>
                  </Link>
                  {!canResume && !r.hasSensitive && (
                    <button
                      onClick={() => setContinueId(r.id)}
                      className="absolute top-2.5 right-2.5 text-[10px] font-bold text-lilac-deep bg-lilac-soft/80 hover:bg-lilac-soft rounded-full px-2 py-1 transition"
                    >
                      후속 상담
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((r) => {
              if (r.generating) {
                const ft = fortuneTypeFromTag(r.emotionTag);
                const genLabel = ft ? FORTUNE_CONFIG[ft].label : r.question;
                return (
                  <div
                    key={r.id}
                    className="rounded-2xl p-3.5 border border-gold/30 flex items-center gap-3 bg-gradient-to-br from-night to-night-deep"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gold/15 flex items-center justify-center text-[18px]">
                      {fortuneIcon(r.emotionTag, 24)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-gold-soft font-medium line-clamp-1">
                        {genLabel}
                      </div>
                      <div className="text-[11px] text-cream/60 mt-1 flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
                        별콩이가 리포트를 만들고 있어…
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <Link
                  key={r.id}
                  href={`/fortune/result?id=${r.id}&from=history`}
                  className="bg-white rounded-2xl p-3.5 border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] flex items-start gap-3 hover:border-lilac-deep/50 transition"
                >
                  <div className="shrink-0 self-center w-12 h-12 rounded-xl bg-gold-soft/30 flex items-center justify-center text-[18px]">
                    {fortuneIcon(r.emotionTag, 24)}
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
                    {r.preview?.trim() && (
                      <p className="text-[11.5px] text-text-light/80 mt-1 leading-snug line-clamp-2">
                        {r.preview.trim()}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

      </div>

      <ContinuationModal
        readingId={continueId}
        onClose={() => setContinueId(null)}
      />
    </main>
  );
}
