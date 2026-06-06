"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { fortuneTypeFromTag, FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";

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

function FortuneResultInner() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [label, setLabel] = useState("별콩 운세");
  const [emoji, setEmoji] = useState("🌤️");
  const [ftType, setFtType] = useState<FortuneType | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
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
      const report =
        (r.messages ?? []).find((m: { role: string }) => m.role === "assistant")
          ?.content ?? "";
      setSections(parseSections(report));
      setLoading(false);
    })();
  }, [id, router]);

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const isMobile =
      typeof navigator !== "undefined" &&
      (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints ?? 0) > 1);

    // 모바일: 네이티브 공유 시트
    if (isMobile && navigator.share) {
      const text =
        `[별콩 운세] ${label}\n\n` +
        sections.map((s) => (s.title ? `▪ ${s.title}\n${s.body}` : s.body)).join("\n\n") +
        `\n\n🌙 ${url}`;
      try {
        await navigator.share({ title: `별콩 운세 · ${label}`, text });
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

      {isDaily ? (
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
