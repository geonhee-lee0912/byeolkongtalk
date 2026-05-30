"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ReadingItem {
  id: string;
  question: string;
  sajuData: {
    dayStem: string;
    dayElement: string;
  };
  starsSpent: number;
  hasSensitive: boolean;
  createdAt: string;
  profile: { display_name: string; relation_type: string } | null;
}

export default function ReadingsPage() {
  const router = useRouter();
  const [readings, setReadings] = useState<ReadingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/auth/me", { cache: "no-store" }).then((x) =>
        x.ok ? x.json() : null
      );
      if (!r?.isAuthenticated) {
        router.replace("/login?next=/readings");
        return;
      }

      const list = await fetch("/api/readings", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (list?.readings) setReadings(list.readings);
      setLoading(false);
    })();
  }, [router]);

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <h1 className="text-[18px] font-bold text-eye-purple">내 고민톡</h1>
        <p className="text-[12px] text-text-light/70 mt-1">
          별콩이와 나눈 사주 풀이 ({readings.length})
        </p>
      </div>

      <div className="w-full max-w-md mx-auto px-5">
        {readings.length === 0 ? (
          <div className="bg-cream-warm rounded-2xl p-6 border border-lilac-mid/30 text-center">
            <p className="text-[13px] text-text-light leading-relaxed">
              아직 풀이가 없어.
              <br />첫 사주를 별콩이랑 펼쳐볼까?
            </p>
            <Link
              href="/saju"
              className="mt-3 inline-block px-5 py-2 rounded-xl bg-lilac-deep text-white text-[12px] font-bold"
            >
              사주 보러가기
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {readings.map((r) => (
              <Link
                key={r.id}
                href={`/saju/result?id=${r.id}`}
                className="bg-cream-warm rounded-2xl p-3.5 border border-lilac-mid/30 flex items-center gap-3 hover:border-lilac-deep/50 transition"
              >
                <div className="w-10 h-10 rounded-lg bg-gold-soft/30 flex items-center justify-center text-[13px] font-bold text-eye-purple">
                  {r.sajuData?.dayStem ?? "-"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-eye-purple line-clamp-1 font-medium">
                    {r.question}
                  </div>
                  <div className="text-[11px] text-text-light/70 mt-0.5 flex items-center gap-1.5">
                    <span>
                      {new Date(r.createdAt).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
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
                <span className="text-text-light/40 text-sm">›</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
