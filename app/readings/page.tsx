"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { fortuneTypeFromTag, FORTUNE_CONFIG } from "@/lib/fortune/types";
import { type DrawnCard, type SpreadType, SPREAD_INFO } from "@/lib/tarot/spreads";
import { getCard } from "@/lib/tarot/cards";
import { SAJU_PRODUCT_INFO, isSajuProduct } from "@/lib/saju/products";
import { readingCategory } from "@/lib/readings/category";
import { getSituation } from "@/lib/relationship/situations";
import { FortuneIconByTag } from "@/components/fortune/FortuneIcon";
import ContinuationModal from "@/components/continuation/ContinuationModal";

interface ReadingItem {
  id: string;
  question: string;
  sajuData: {
    dayStem?: string;
    dayElement?: string;
    pillars?: { day?: { stem: string; branch: string } };
    situationId?: string; // 시뮬(SimMeta) 판별용
    phase?: "stage" | "debriefed"; // 시뮬(SimMeta) 판별용
  } | null;
  consultationType?: string;
  relationshipId?: string | null;
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

// /api/relationship GET(P2 shape) 항목 — 이 페이지가 쓰는 필드만 선언(구조적 타입이라 초과 필드는 무해).
interface RelationshipListItem {
  id: string;
  label: string;
  status: string;
  partner: { displayName: string } | null;
  lastVisitedAt: string | null;
}

const READINGS_TABS = [
  { key: "tarot", label: "타로톡" },
  { key: "fortune", label: "사주·운세" },
  { key: "sim", label: "시뮬레이션" },
] as const;

type ReadingsTab = (typeof READINGS_TABS)[number]["key"];

const PAGE_SIZE = 5; // 보관함 목록 페이지네이션 (5개/페이지)

const EMPTY_COPY: Record<ReadingsTab, { text: ReactNode; href: string; cta: string }> = {
  tarot: {
    text: (
      <>
        아직 타로 상담 기록이 없어.
        <br />첫 고민을 별콩이랑 풀어볼까?
      </>
    ),
    href: "/concern",
    cta: "고민 상담 하러가기",
  },
  fortune: {
    text: (
      <>
        아직 본 운세가 없어.
        <br />별콩 운세를 펼쳐볼까?
      </>
    ),
    href: "/fortune",
    cta: "운세 보러가기",
  },
  sim: {
    text: (
      <>
        아직 연애 시뮬레이션 기록이 없어.
        <br />인형이랑 연습을 시작해볼까?
      </>
    ),
    href: "/relationship",
    cta: "시뮬레이션 하러가기",
  },
};

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

/** 운세 종류별 아이콘 — 전 지면 공통 세트(webp), 아이콘 없는 종은 이모지 폴백 */
function fortuneIcon(emotionTag: string | null | undefined, size: number) {
  return <FortuneIconByTag emotionTag={emotionTag} size={size} />;
}

/** 시뮬 아바타 — 상황 카탈로그의 이모지(situationId 매칭), 없으면 기본 🎭 */
function simAvatar(r: ReadingItem) {
  const emoji = getSituation(r.sajuData?.situationId ?? "")?.emoji ?? "🎭";
  return (
    <div aria-hidden="true" className="shrink-0 self-center w-12 h-12 rounded-xl bg-lilac-soft/50 flex items-center justify-center text-[18px]">
      {emoji}
    </div>
  );
}

function EmptyState({ tab }: { tab: ReadingsTab }) {
  const c = EMPTY_COPY[tab];
  return (
    <div className="bg-white rounded-2xl p-6 border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] text-center">
      <Image
        src="/byeolkong-curious.png"
        alt=""
        width={88}
        height={88}
        className="mx-auto mb-3"
        aria-hidden
      />
      <p className="text-[13px] text-text-light leading-relaxed">{c.text}</p>
      <Link
        href={c.href}
        className="mt-3 inline-block px-5 py-2 rounded-xl bg-lilac-deep text-white text-[12px] font-bold"
      >
        {c.cta}
      </Link>
    </div>
  );
}

// 타로 + (사주·운세 안의) 사주 상담 스타일 카드 — 완료/이어하기/후속 상담/프로필 칩/민감 표시(현행 유지).
function renderConsultCard(r: ReadingItem, onContinue: (id: string) => void) {
  const isTarot = r.consultationType === "tarot";
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
          onClick={() => onContinue(r.id)}
          className="absolute top-2.5 right-2.5 text-[10px] font-bold text-lilac-deep bg-lilac-soft/80 hover:bg-lilac-soft rounded-full px-2 py-1 transition"
        >
          후속 상담
        </button>
      )}
    </div>
  );
}

// 운세 리포트 카드(생성 중 폴링 포함) — 현행 유지.
function renderReportCard(r: ReadingItem) {
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
}

// 시뮬 카드 — 완료(debriefed)="완료"/진행중(stage)="진행 중" 배지.
// 재진입: /relationship/sim?sim=<id> → 완료=디브리핑 재열람, 진행중=재개(무차감).
// (재진입 인프라 = specs/2026-08-09-sim-reentry-design.md. GET·read-only·POST 미호출이라 재차감·고아판 없음.)
function renderSimCard(r: ReadingItem, relLabelById: Map<string, string>) {
  const done = r.sajuData?.phase === "debriefed";
  const href = `/relationship/sim?sim=${r.id}`;
  const relLabel = r.relationshipId ? relLabelById.get(r.relationshipId) : undefined;
  const subParts = [formatDate(r.createdAt)];
  if (relLabel) subParts.push(relLabel);
  subParts.push(r.starsSpent === 0 ? "무료" : `⭐ ${r.starsSpent}`);
  return (
    <Link
      key={r.id}
      href={href}
      className="bg-white rounded-2xl p-3.5 border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.08)] flex gap-3 items-start hover:border-lilac-deep/50 transition"
    >
      {simAvatar(r)}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13.5px] font-bold text-eye-purple whitespace-nowrap">
            {r.question}
          </span>
          <span
            className={[
              "shrink-0 text-[10px] font-bold rounded-full px-1.5 py-0.5",
              done ? "text-lilac-deep bg-lilac-soft" : "text-text-light/70 bg-lilac-soft/40",
            ].join(" ")}
          >
            {done ? "완료" : "진행 중"}
          </span>
        </div>
        <p className="text-[10px] text-text-light/60 mt-0.5 leading-snug line-clamp-2">
          {subParts.join(" · ")}
        </p>
      </div>
    </Link>
  );
}

export default function ReadingsPage() {
  return (
    <Suspense fallback={null}>
      <ReadingsPageInner />
    </Suspense>
  );
}

function ReadingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [readings, setReadings] = useState<ReadingItem[]>([]);
  const [relationships, setRelationships] = useState<RelationshipListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ReadingsTab>(() => {
    const t = searchParams.get("tab");
    return READINGS_TABS.some((x) => x.key === t) ? (t as ReadingsTab) : "tarot";
  });
  const [continueId, setContinueId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const loadReadings = async () => {
    const list = await fetch("/api/readings", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    if (list?.readings) setReadings(list.readings);
  };

  const loadRelationships = async () => {
    const data = await fetch("/api/relationship", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    if (data?.relationships) setRelationships(data.relationships);
  };

  useEffect(() => {
    void (async () => {
      const [me] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        loadReadings(),
        loadRelationships(),
      ]);
      if (!me?.isAuthenticated) {
        router.replace("/login?next=/readings");
        return;
      }
      setLoading(false);
    })();
  }, [router]);

  // 종목 분류(Task 1 readingCategory 공유) — 우리 사이는 /api/relationship 에서 별도로 온다.
  const { tarot, fortune, sim } = useMemo(() => {
    const tarot: ReadingItem[] = [];
    const fortune: ReadingItem[] = [];
    const sim: ReadingItem[] = [];
    for (const r of readings) {
      const cat = readingCategory({ consultationType: r.consultationType, emotionTag: r.emotionTag });
      if (cat === "tarot") tarot.push(r);
      else if (cat === "sim") sim.push(r);
      else if (cat === "fortune") fortune.push(r);
      // "relationship" 은 /api/readings 에 안 실리므로(서버 .neq 필터) 도달하지 않음.
    }
    return { tarot, fortune, sim };
  }, [readings]);

  const relLabelById = useMemo(
    () => new Map(relationships.map((r) => [r.id, r.label])),
    [relationships]
  );

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
    setPage(0);
  };

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  const counts: Record<ReadingsTab, number> = {
    tarot: tarot.length,
    fortune: fortune.length,
    sim: sim.length,
  };
  const activeCount = counts[tab];
  const totalPages = Math.max(1, Math.ceil(activeCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;

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
        <h1 className="text-[18px] font-bold text-eye-purple">내 상담 보관함</h1>
        <p className="text-[12px] text-text-light/70 mt-1">
          별콩이와 나눈 상담과 운세를 다시 볼 수 있어
        </p>
      </div>

      <div className="w-full max-w-md mx-auto px-5 mb-4">
        <div className="flex gap-2 overflow-x-auto">
          {READINGS_TABS.map((t) => {
            const count = counts[t.key];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => switchTab(t.key)}
                aria-pressed={tab === t.key}
                className={[
                  "shrink-0 text-[13px] font-bold px-4 py-1.5 rounded-full whitespace-nowrap transition",
                  tab === t.key
                    ? "bg-eye-purple text-white"
                    : "bg-white border border-lilac-soft text-text-light",
                ].join(" ")}
              >
                {t.label} {count > 0 && <span className="text-[12px]">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-full max-w-md mx-auto px-5">
        {activeCount === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <>
            {tab === "tarot" ? (
              <div className="flex flex-col gap-2">
                {tarot.slice(pageStart, pageEnd).map((r) => renderConsultCard(r, (id) => setContinueId(id)))}
              </div>
            ) : tab === "fortune" ? (
              <div className="flex flex-col gap-2">
                {fortune.slice(pageStart, pageEnd).map((r) =>
                  fortuneTypeFromTag(r.emotionTag)
                    ? renderReportCard(r)
                    : renderConsultCard(r, (id) => setContinueId(id))
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {sim.slice(pageStart, pageEnd).map((r) => renderSimCard(r, relLabelById))}
              </div>
            )}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
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
          </>
        )}
      </div>

      <ContinuationModal
        readingId={continueId}
        onClose={() => setContinueId(null)}
      />
    </main>
  );
}
