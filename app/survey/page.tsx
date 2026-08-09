"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SURVEY_QUESTIONS, SURVEY_MIN_CHARS } from "@/lib/survey/questions";
import { SURVEY_REWARD_STARS } from "@/lib/constants";

type Phase = "loading" | "form" | "already" | "done";

export default function SurveyPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [nickname, setNickname] = useState("");
  const [answers, setAnswers] = useState<string[]>(() => SURVEY_QUESTIONS.map(() => ""));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null);
      if (cancelled) return;
      if (!me?.isAuthenticated || !me.user?.id) {
        router.replace(`/login?next=${encodeURIComponent("/survey")}`);
        return;
      }
      setNickname(me.user.nickname ?? "");
      const s = await fetch("/api/survey", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null);
      if (cancelled) return;
      setPhase(s?.participated ? "already" : "form");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const allValid = answers.every((a) => a.trim().length >= SURVEY_MIN_CHARS);

  const submit = async () => {
    if (!allValid || submitting) return;
    setSubmitting(true);
    setError(null);
    const r = await fetch("/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    })
      .then((res) => res.json())
      .catch(() => null);
    setSubmitting(false);
    if (r?.ok) return setPhase("done");
    if (r?.reason === "already") return setPhase("already");
    setError("제출이 안 됐어. 잠시 후 다시 해줄래?");
  };

  if (phase === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">불러오는 중…</p>
      </main>
    );
  }
  if (phase === "already") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-5 text-center gap-4">
        <p className="text-[15px] text-eye-purple">이미 이야기 들려줬어. 고마워 🌟</p>
        <Link href="/" className="px-6 py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px]">
          홈으로
        </Link>
      </main>
    );
  }
  if (phase === "done") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-5 text-center gap-4">
        <p className="text-[15px] text-eye-purple leading-relaxed">
          들려줘서 고마워!
          <br />
          별콩별 {SURVEY_REWARD_STARS}개를 넣어줬어 🌟
        </p>
        <Link href="/" className="px-6 py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px]">
          홈으로
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5">
        <h1 className="text-lg font-bold text-eye-purple mb-2">별콩이의 질문</h1>
        <p className="text-[13px] text-text-light leading-relaxed mb-6">
          {nickname ? `${nickname}아, ` : ""}별콩이는 너 같은 친구들 이야기를 들으면서 자라. 한두 문장이면 충분하니까 편하게 적어줘. 다 적으면 별콩별 {SURVEY_REWARD_STARS}개 🌟
        </p>
        <div className="space-y-5">
          {SURVEY_QUESTIONS.map((q, i) => {
            const len = answers[i].trim().length;
            const ok = len >= SURVEY_MIN_CHARS;
            return (
              <div key={q.id}>
                <label className="block text-[13.5px] font-bold text-eye-purple mb-2">
                  {i + 1}. {q.text}
                </label>
                <textarea
                  value={answers[i]}
                  onChange={(e) =>
                    setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))
                  }
                  rows={3}
                  className="w-full rounded-xl border border-lilac-mid/40 bg-cream-warm p-3 text-[13px] text-eye-purple resize-none focus:outline-none focus:border-lilac-deep"
                  placeholder="솔직하게 들려줘"
                />
                <div className={`text-[11px] mt-1 text-right ${ok ? "text-lilac-deep" : "text-text-light/50"}`}>
                  {len} / {SURVEY_MIN_CHARS}자
                </div>
              </div>
            );
          })}
        </div>
        {error && <p className="text-[12px] text-rose-500 mt-4">{error}</p>}
        <button
          onClick={submit}
          disabled={!allValid || submitting}
          className="w-full mt-6 py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[14px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? "보내는 중…" : `별콩별 ${SURVEY_REWARD_STARS}개 받기`}
        </button>
      </div>
    </main>
  );
}
