"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SURVEY_QUESTIONS, SURVEY_MIN_CHARS, CONTACT_OPTIONS, MULTI_INPUT_MAX, composeMultiAnswer, isMultiSelectionValid } from "@/lib/survey/questions";
import { SURVEY_REWARD_STARS } from "@/lib/constants";
import ButtonDots from "@/components/common/ButtonDots";

type Phase = "loading" | "form" | "already" | "done";

export default function SurveyPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [answers, setAnswers] = useState<string[]>(() => SURVEY_QUESTIONS.map(() => ""));
  const [contactChecked, setContactChecked] = useState<string[]>([]);
  const [contactInputs, setContactInputs] = useState<Record<string, string>>({});
  const toggleContact = (id: string) =>
    setContactChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const setContactInput = (id: string, v: string) =>
    setContactInputs((prev) => ({ ...prev, [id]: v }));
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

  const textValid = SURVEY_QUESTIONS.every((q, i) =>
    q.type === "multi" ? true : answers[i].trim().length >= SURVEY_MIN_CHARS
  );
  const contactValid = isMultiSelectionValid(CONTACT_OPTIONS, contactChecked, contactInputs);
  const allValid = textValid && contactValid;

  const submit = async () => {
    if (!allValid || submitting) return;
    setSubmitting(true);
    setError(null);
    const payload = SURVEY_QUESTIONS.map((q, i) =>
      q.type === "multi" ? composeMultiAnswer(CONTACT_OPTIONS, contactChecked, contactInputs) : answers[i]
    );
    const r = await fetch("/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: payload }),
    })
      .then((res) => res.json())
      .catch(() => null);
    setSubmitting(false);
    if (r?.ok) return setPhase("done");
    if (r?.reason === "already") return setPhase("already");
    if (r?.reason === "auth") {
      router.replace(`/login?next=${encodeURIComponent("/survey")}`);
      return;
    }
    setError("제출이 안 됐어. 잠시 후 다시 해줄래?");
  };

  if (phase === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-14">불러오는 중…</p>
      </main>
    );
  }
  if (phase === "already") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-5 text-center gap-4">
        <p className="text-15 text-eye-purple">이미 이야기 들려줬어. 고마워</p>
        <Link href="/" className="btn btn-primary btn-md">
          홈으로
        </Link>
      </main>
    );
  }
  if (phase === "done") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-5 text-center gap-4">
        <p className="text-15 text-eye-purple leading-relaxed">
          들려줘서 고마워!
          <br />
          별콩별 {SURVEY_REWARD_STARS}개를 넣어줬어
        </p>
        <Link href="/" className="btn btn-primary btn-md">
          홈으로
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5">
        {/* 앱에선 위 헤더 제목(별콩이의 질문)과 겹쳐 숨긴다(web-only) */}
        <h1 className="web-only text-17 font-bold text-eye-purple mb-2">별콩이의 질문</h1>
        <p className="text-13 text-text-light leading-relaxed mb-3">
          별콩이를 도와줘! 너의 한마디로 더 좋은 별콩이가 될 수 있으니 편하고 솔직하게 적어줘. 다 적으면 별콩별 {SURVEY_REWARD_STARS}개를 줄게~!
        </p>
        <p className="text-12 text-eye-purple bg-gold-soft/20 border border-gold/30 rounded-xl px-3 py-2 mb-6">
          매달 가장 정성들인 의견을 전달해준 친구에게 추가로 별을 보내줄거야
        </p>
        {/* 질문마다 흰 카드 + 안쪽 입력칸(card-inner 모양) — 디자인 다듬기 ② /survey 운영자 A안 11-12 */}
        <div className="flex flex-col gap-3">
          {SURVEY_QUESTIONS.map((q, i) => {
            if (q.type === "multi") {
              return (
                <div key={q.id} className="card">
                  <label className="block text-15 font-bold text-eye-purple mb-2">
                    {i + 1}. {q.text}
                  </label>
                  {/* 체크박스 20 · 한 줄 40 — 작아서 누르기 어려웠다(디자인 다듬기 ② /survey 운영자 B안 11-12) */}
                  <div>
                    {q.options.map((opt) => {
                      const on = contactChecked.includes(opt.id);
                      return (
                        <div key={opt.id}>
                          <label className="flex items-center gap-2.5 min-h-10 text-14 text-eye-purple cursor-pointer">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleContact(opt.id)}
                              className="h-5 w-5 shrink-0 accent-lilac-deep"
                            />
                            {opt.label}
                          </label>
                          {on && opt.input && (
                            <input
                              type="text"
                              value={contactInputs[opt.id] ?? ""}
                              onChange={(e) => setContactInput(opt.id, e.target.value)}
                              maxLength={MULTI_INPUT_MAX}
                              placeholder={opt.input.prompt}
                              className="mt-1 mb-1.5 ml-7.5 w-[calc(100%-1.875rem)] rounded-xl border border-lilac-mid/35 bg-inner p-2.5 text-13 text-eye-purple focus:outline-none focus:border-lilac-deep"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }
            const len = answers[i].trim().length;
            const ok = len >= SURVEY_MIN_CHARS;
            return (
              <div key={q.id} className="card">
                <label className="block text-15 font-bold text-eye-purple mb-2">
                  {i + 1}. {q.text}
                </label>
                <textarea
                  value={answers[i]}
                  onChange={(e) =>
                    setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))
                  }
                  rows={3}
                  className="w-full rounded-xl border border-lilac-mid/35 bg-inner p-3 text-13 text-eye-purple resize-none focus:outline-none focus:border-lilac-deep"
                  placeholder="편하게 작성해줘"
                />
                <div className={`text-11 mt-1 text-right ${ok ? "text-accent" : "text-text-light"}`}>
                  {ok ? `${len}자` : `최소 ${SURVEY_MIN_CHARS}자 · ${len}자`}
                </div>
              </div>
            );
          })}
        </div>
        {error && <p className="text-12 text-rose-500 mt-4">{error}</p>}
        <button
          onClick={submit}
          disabled={!allValid || submitting}
          className="btn btn-primary btn-lg mt-6 disabled:cursor-not-allowed"
        >
          {submitting ? <ButtonDots /> : `별콩별 ${SURVEY_REWARD_STARS}개 받기`}
        </button>
      </div>
    </main>
  );
}
