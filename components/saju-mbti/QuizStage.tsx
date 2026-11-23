"use client";

import { useMemo, useState } from "react";
import { QUESTIONS } from "@/lib/saju-mbti/questions";
import Icon from "@/components/common/Icon";

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
      {/* 진행 — 보라 막대(지금 문항까지 채움)·지금 번호 강조·'‹ 이전' 왼쪽, 질문 굵게(디자인 다듬기 사주 MBTI ② Q1, 운영자 11-20).
          예전엔 금색 막대가 답한 만큼만 차서 첫 문항엔 비어 있었고, 번호·이전이 둘 다 작은 회색, 질문이 보기와 같은 굵기였다 */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          {idx > 0 ? (
            <button type="button" onClick={() => setIdx(idx - 1)} className="inline-flex items-center gap-0.5 text-13 font-medium text-accent">
              <Icon name="back" size={14} />
              이전
            </button>
          ) : (
            <span />
          )}
          <span className="text-13 text-text-light tabular-nums">
            <b className="font-bold text-accent">{idx + 1}</b> / {total}
          </span>
        </div>
        <div className="h-1.5 bg-lilac-soft rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${((idx + 1) / total) * 100}%` }} />
        </div>
      </div>

      <p className="text-17 font-bold text-eye-purple mb-6 leading-snug text-balance">{q.prompt}</p>

      <div className="flex flex-col gap-3">
        {q.options.map((o) => {
          const chosen = answers[q.id] === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => pick(o.id)}
              className={`text-left bg-white rounded-2xl shadow-card px-4 py-3.5 text-15 text-eye-purple transition-colors ${
                chosen ? "outline-2 outline-accent -outline-offset-2" : "hover:bg-inner"
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
