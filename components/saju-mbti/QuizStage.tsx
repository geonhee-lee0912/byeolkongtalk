"use client";

import { useMemo, useState } from "react";
import { QUESTIONS } from "@/lib/saju-mbti/questions";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 12문항 스텝퍼. 선택지는 마운트당 1회 셔플(위치 랜덤, 점수는 옵션 id 기준이라 안전 — B).
export function QuizStage({ onDone }: { onDone: (answers: Record<string, string>) => void }) {
  const questions = useMemo(() => QUESTIONS.map((q) => ({ ...q, options: shuffle(q.options) })), []);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const q = questions[idx];
  const total = questions.length;

  function pick(optionId: string) {
    const next = { ...answers, [q.id]: optionId };
    setAnswers(next);
    if (idx + 1 < total) setIdx(idx + 1);
    else onDone(next);
  }

  return (
    <div className="w-full max-w-md mx-auto px-5 py-8 animate-fade-in" data-stage="quiz">
      <div className="mb-6">
        <div className="flex justify-between items-center text-[12px] text-text-light mb-2">
          <span>
            {idx + 1} / {total}
          </span>
          {idx > 0 && (
            <button type="button" onClick={() => setIdx(idx - 1)} className="text-lilac-deep">
              ← 이전
            </button>
          )}
        </div>
        <div className="h-1.5 bg-lilac-soft rounded-full overflow-hidden">
          <div className="h-full bg-gold transition-all duration-300" style={{ width: `${(idx / total) * 100}%` }} />
        </div>
      </div>

      <p className="font-display text-lg text-eye-purple mb-6 leading-snug text-balance">{q.prompt}</p>

      <div className="flex flex-col gap-3">
        {q.options.map((o) => {
          const chosen = answers[q.id] === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => pick(o.id)}
              className={`text-left rounded-2xl border px-4 py-3.5 text-[15px] text-eye-purple transition-colors ${
                chosen ? "bg-lilac-soft border-lilac-deep" : "bg-cream-warm border-lilac hover:bg-lilac-soft hover:border-lilac-deep"
              }`}
            >
              {o.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
