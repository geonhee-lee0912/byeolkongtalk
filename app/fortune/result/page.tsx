"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { fortuneTypeFromTag, FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";
import DailyReportCard from "@/components/fortune/DailyReportCard";
import MonthlyReportView from "@/components/fortune/monthly/MonthlyReportView";
import {
  tryParseStoredDailyReport,
  DAILY_SECTIONS,
  type DailyReport,
} from "@/lib/fortune/daily-report";
import {
  tryParseStoredMonthlyReport,
  type MonthlyReport,
} from "@/lib/fortune/monthly-report";
import {
  tryParseStoredSajuFullReport,
  type SajuFullReport,
} from "@/lib/fortune/saju-full-report";
import {
  tryParseStoredCompatReport,
  type CompatReport,
  type CompatSajuPair,
} from "@/lib/fortune/compat-report";
import SajuFullReportView from "@/components/fortune/saju-full/SajuFullReportView";
import CompatReportView from "@/components/fortune/compat/CompatReportView";
import type { SajuResult } from "@/lib/saju/calc";

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

function buildDailyShareText(r: DailyReport, label: string, url: string): string {
  const stars = "★".repeat(r.stars) + "☆".repeat(5 - r.stars);
  const domains = DAILY_SECTIONS.map((m) => {
    const sec = r.sections.find((s) => s.key === m.key);
    return sec ? `▪ ${m.title}\n${sec.body}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
  return (
    `[별콩 운세] ${label}\n` +
    `${r.iljin.hanja} · ${r.summary}\n` +
    `오늘 종합운 ${stars}\n\n` +
    `${r.intro}\n\n` +
    `${domains}\n\n` +
    `✅ ${r.balance.good}\n⚠️ ${r.balance.warn}\n\n` +
    `🌙 별콩이의 한마디\n${r.note}\n\n` +
    `${url}`
  );
}

function buildMonthlyShareText(r: MonthlyReport, label: string, url: string): string {
  const stars = "★".repeat(r.stars) + "☆".repeat(5 - r.stars);
  const weekly = r.weekly.map((w) => `${w.week}주차\n${w.body}`).join("\n\n");
  const domains = DAILY_SECTIONS.map((m) => {
    const sec = r.sections.find((s) => s.key === m.key);
    return sec ? `▪ ${m.title}\n${sec.body}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
  return (
    `[별콩 운세] ${label}\n` +
    `${r.wolgeon.hanja} · ${r.theme}\n` +
    `이번 달 종합운 ${stars}\n${r.summary}\n\n` +
    `${r.intro}\n\n` +
    `[주차별 흐름]\n${weekly}\n\n` +
    `${domains}\n\n` +
    `[주목할 시기]\n흐름이 좋아: ${r.timing.good}\n점검할 때: ${r.timing.caution}\n\n` +
    `✅ ${r.balance.good}\n⚠️ ${r.balance.warn}\n\n` +
    `🌙 별콩이의 한마디\n${r.note}\n\n` +
    `${url}`
  );
}

function buildSajuFullShareText(r: SajuFullReport, label: string, url: string): string {
  const months = r.monthly.map((m) => `${m.month}월: ${m.body}`).join("\n");
  return (
    `[별콩 운세] ${label}\n` +
    `${r.year2026.hanja}년 · ${r.theme}\n` +
    `${r.summary}\n\n` +
    `🍀 행운: ${r.lucky.color} · ${r.lucky.direction} · ${r.lucky.months} · ${r.lucky.keyword}\n\n` +
    `[나라는 사람]\n${r.self.nature}\n\n${r.self.strength}\n\n${r.self.caution}\n\n` +
    `오행 밸런스: ${r.self.balance.lack}\n적성: ${r.self.aptitude}\n\n` +
    `[2026년 총운]\n큰 흐름: ${r.year.flow}\n마음: ${r.year.mind}\n사랑: ${r.year.love}\n` +
    `관계: ${r.year.relationship}\n일: ${r.year.career}\n재물: ${r.year.wealth}\n건강: ${r.year.health}\n\n` +
    `[월별 흐름]\n${months}\n\n` +
    `[주목할 시기]\n흐름 좋은 달: ${r.timing.good}\n점검할 달: ${r.timing.caution}\n\n` +
    `[올해 실천]\n${r.actions.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n\n` +
    `🌙 별콩이의 한마디\n${r.note}\n\n` +
    `${url}`
  );
}

function buildCompatShareText(r: CompatReport, label: string, url: string): string {
  return (
    `[별콩 운세] ${label}\n` +
    `${r.grade} · ${r.theme}\n` +
    `${r.summary}\n\n` +
    `[오행 케미]\n${r.chemistry}\n\n` +
    `[끌림·성격]\n${r.attraction}\n\n` +
    `[갈등 포인트]\n${r.conflict}\n\n` +
    `[장기 전망]\n${r.longterm}\n\n` +
    `[관계 조언]\n${r.advice.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n\n` +
    `🌙 별콩이의 한마디\n${r.note}\n\n` +
    `${url}`
  );
}

function FortuneResultInner() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [label, setLabel] = useState("별콩 운세");
  const [emoji, setEmoji] = useState("🌤️");
  const [ftType, setFtType] = useState<FortuneType | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [sajuFullReport, setSajuFullReport] = useState<SajuFullReport | null>(null);
  const [compatReport, setCompatReport] = useState<CompatReport | null>(null);
  const [sajuData, setSajuData] = useState<SajuResult | null>(null);
  const [compatSaju, setCompatSaju] = useState<CompatSajuPair | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      router.replace("/fortune");
      return;
    }
    void (async () => {
      let res = await fetch(`/api/readings/${id}`, { cache: "no-store" }).catch(
        () => null
      );
      // 비로그인 또는 비소유자(공유 링크) — 공개 조회로 폴백
      if (res && (res.status === 401 || res.status === 403)) {
        setIsPublic(true);
        res = await fetch(`/api/readings/${id}/public`, {
          cache: "no-store",
        }).catch(() => null);
      }
      const r = res && res.ok ? await res.json().catch(() => null) : null;
      if (!r?.reading) {
        setError(true);
        setLoading(false);
        return;
      }
      const ft = fortuneTypeFromTag(r.reading.emotionTag);
      if (ft) {
        setFtType(ft);
        setLabel(FORTUNE_CONFIG[ft].label);
        setEmoji(FORTUNE_CONFIG[ft].emoji);
      }
      if (r.reading.createdAt) setCreatedAt(r.reading.createdAt);
      if (r.reading.sajuData) {
        if (ft === "compat" || ft === "compat_social") {
          setCompatSaju(r.reading.sajuData as CompatSajuPair);
        } else {
          setSajuData(r.reading.sajuData as SajuResult);
        }
      }
      const report =
        (r.messages ?? []).find((m: { role: string }) => m.role === "assistant")
          ?.content ?? "";
      const daily = ft === "daily" ? tryParseStoredDailyReport(report) : null;
      const monthly = ft === "monthly" ? tryParseStoredMonthlyReport(report) : null;
      const sajuFull = ft === "saju_full" ? tryParseStoredSajuFullReport(report) : null;
      const compat =
        ft === "compat" || ft === "compat_social"
          ? tryParseStoredCompatReport(report)
          : null;
      if (daily) {
        setDailyReport(daily);
      } else if (monthly) {
        setMonthlyReport(monthly);
      } else if (sajuFull) {
        setSajuFullReport(sajuFull);
      } else if (compat) {
        setCompatReport(compat);
      } else {
        setSections(parseSections(report));
      }
      setLoading(false);
    })();
  }, [id, router]);

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const isMobile =
      typeof navigator !== "undefined" &&
      (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints ?? 0) > 1);

    const shareText = dailyReport
      ? buildDailyShareText(dailyReport, label, url)
      : monthlyReport
        ? buildMonthlyShareText(monthlyReport, label, url)
        : sajuFullReport
          ? buildSajuFullShareText(sajuFullReport, label, url)
          : compatReport
            ? buildCompatShareText(compatReport, label, url)
            : `[별콩 운세] ${label}\n\n` +
            sections.map((s) => (s.title ? `▪ ${s.title}\n${s.body}` : s.body)).join("\n\n") +
            `\n\n🌙 ${url}`;

    // 모바일: 네이티브 공유 시트
    if (isMobile && navigator.share) {
      try {
        await navigator.share({ title: `별콩 운세 · ${label}`, text: shareText });
        return;
      } catch {
        /* 취소 — 링크 복사로 폴백 */
      }
    }

    // 데스크탑: 링크 클립보드 복사
    try {
      await navigator.clipboard.writeText(url);
      setToast("링크를 복사했어");
      setTimeout(() => setToast(null), 2000);
    } catch {
      setToast("복사를 못 했어");
      setTimeout(() => setToast(null), 2000);
    }
  };

  const isDaily = ftType === "daily";
  const dateLabel =
    isDaily && createdAt
      ? new Date(createdAt).toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
          timeZone: "Asia/Seoul",
        })
      : null;
  const isMonthly = ftType === "monthly";
  const isSajuFull = ftType === "saju_full";
  const isCompat = ftType === "compat" || ftType === "compat_social";
  const compatVariant = ftType === "compat_social" ? "social" : "romantic";
  const monthLabel =
    isMonthly && createdAt
      ? new Date(createdAt).toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          timeZone: "Asia/Seoul",
        })
      : null;

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">별콩이가 운세를 펼치는 중…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-5 gap-3">
        <p className="text-text-light text-sm">운세를 찾을 수 없어.</p>
        <Link href="/fortune" className="text-lilac-deep text-sm font-bold underline">
          별콩 운세로 돌아가기
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      {!isPublic && (
        <div className="w-full max-w-md mx-auto px-5 mb-1">
          <button
            onClick={() => router.back()}
            aria-label="뒤로 가기"
            className="inline-flex items-center gap-1 text-text-light/70 text-[13px] font-medium hover:text-text-light transition"
          >
            <span className="text-[16px] leading-none">‹</span> 뒤로
          </button>
        </div>
      )}
      {!((isDaily && dailyReport) || (isMonthly && monthlyReport) || (isSajuFull && sajuFullReport) || (isCompat && compatReport)) && (
        <div className="w-full max-w-md mx-auto px-5 flex flex-col items-center mb-5">
          <div className="relative">
            <Image src="/byeolkong-main.png" alt="별콩이" width={84} height={84} />
          </div>
          {dateLabel && (
            <p className="mt-2 text-[12px] font-medium text-lilac-deep">{dateLabel}</p>
          )}
          <h1 className="mt-1 font-display text-[22px] font-bold text-eye-purple text-center">
            {emoji} {label}
          </h1>
        </div>
      )}

      {isDaily && dailyReport ? (
        <DailyReportCard report={dailyReport} dateLabel={dateLabel} />
      ) : isMonthly && monthlyReport ? (
        <MonthlyReportView report={monthlyReport} monthLabel={monthLabel} />
      ) : isSajuFull && sajuFullReport ? (
        <SajuFullReportView report={sajuFullReport} saju={sajuData} />
      ) : isCompat && compatReport ? (
        <CompatReportView report={compatReport} saju={compatSaju} variant={compatVariant} />
      ) : isDaily ? (
        <div className="w-full max-w-md mx-auto px-5">
          <div className="bg-cream-warm rounded-2xl px-5 py-6 border border-lilac-mid/30">
            {sections.flatMap((s) => s.body.split(/\n{2,}/)).map((p, j) => (
              <p
                key={j}
                className="text-[14.5px] text-text leading-[1.9] whitespace-pre-line [&:not(:first-child)]:mt-4"
              >
                {p.trim()}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-3">
          {sections.map((s, i) => (
            <div
              key={i}
              className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30"
            >
              {s.title && (
                <h2 className="text-[14px] font-bold text-lilac-deep mb-2">{s.title}</h2>
              )}
              {s.body.split(/\n{2,}/).map((p, j) => (
                <p
                  key={j}
                  className="text-[13.5px] text-text leading-relaxed whitespace-pre-line [&:not(:first-child)]:mt-2"
                >
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="w-full max-w-md mx-auto px-5 mt-6 flex flex-col gap-2.5">
        {isPublic ? (
          <Link
            href="/login"
            className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] text-center hover:bg-lilac-deep/90 active:scale-[0.98] transition"
          >
            로그인하고 오늘의 운세 무료로 보기
          </Link>
        ) : (
          <>
            <button
              onClick={handleShare}
              className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
            >
              친구한테 이 운세 공유하기
            </button>
            <Link
              href="/fortune"
              className="w-full py-3 rounded-xl border border-lilac-deep/40 text-lilac-deep font-bold text-[14px] text-center hover:bg-lilac-deep/5 transition"
            >
              다른 운세 보기
            </Link>
            <Link
              href="/readings"
              className="w-full py-2 text-text-light/70 text-[12px] text-center"
            >
              내 고민톡에서 다시 보기
            </Link>
          </>
        )}
      </div>

      <p className="mt-5 text-[11px] text-text-light/45 text-center px-8 leading-relaxed">
        운세는 정해진 미래가 아니라 흐름과 가능성이야. 선택은 늘 너에게 있어 ✨
      </p>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-eye-purple text-white text-[12px] px-4 py-2 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </main>
  );
}

export default function FortuneResultPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center px-5">
          <p className="text-text-light text-sm">잠시만…</p>
        </main>
      }
    >
      <FortuneResultInner />
    </Suspense>
  );
}
