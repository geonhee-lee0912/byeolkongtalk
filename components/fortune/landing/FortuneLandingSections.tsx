// 랜딩 본문 4섹션 — 궁금 / 목차 / 샘플 / 관련상품. 상품 종류를 모르는 순수 표시 컴포넌트.
import Link from "next/link";
import type { ReactNode } from "react";
import { MarkdownLite } from "@/lib/markdown-lite";
import { splitLengthHint } from "@/lib/fortune/outline";
import { FortuneIcon } from "@/components/fortune/FortuneIcon";
import { FORTUNE_CONFIG, FORTUNE_GRADIENTS, type FortuneType } from "@/lib/fortune/types";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="w-full max-w-md mx-auto px-5 mt-6">
      <h2 className="text-[14.5px] font-bold text-eye-purple">{title}</h2>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** 숫자를 크게 세우는 칸 — 섹션 수·분량. "이만큼 받는다"가 한눈에 읽혀야 하는 자리다. */
function Stat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div className="flex-1 bg-white rounded-2xl border border-lilac-mid/20 px-3.5 py-2.5">
      <p className="font-display text-[22px] text-eye-purple leading-none">
        {value}
        <span className="text-[12px] ml-0.5">{unit}</span>
      </p>
      <p className="text-[10.5px] text-text-light/70 mt-1.5">{label}</p>
    </div>
  );
}

export default function FortuneLandingSections({
  questions,
  outline,
  lengthHint,
  sample,
  samplePreview,
  related,
}: {
  questions: string[];
  outline: string[];
  lengthHint?: string;
  sample: string | null;
  samplePreview: ReactNode;
  related: FortuneType[];
}) {
  const len = splitLengthHint(lengthHint);

  return (
    <>
      <Block title="이런 게 궁금하면">
        <ul className="flex flex-col gap-1.5">
          {questions.map((q) => (
            <li key={q} className="text-[13px] text-text-light leading-relaxed flex gap-2">
              <span className="text-gold shrink-0" aria-hidden>✦</span>
              <span>{q}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="리포트에 담기는 것">
        <div className="flex gap-2">
          <Stat value={String(outline.length)} unit="개" label="섹션" />
          {/* 분량 힌트가 없는 종목(무료 MBTI)은 섹션 칸만 — 빈 칸을 만들지 않는다. */}
          {len && <Stat value={len.value} unit={len.unit} label="분량" />}
        </div>

        {/* 줄 리스트 대신 칩 — 같은 높이에 훨씬 많이 들어가서 전 섹션을 접지 않고 보여준다. */}
        <ul className="flex flex-wrap gap-1.5 mt-3">
          {outline.map((h) => (
            <li
              key={h}
              className="text-[11.5px] text-eye-purple bg-lilac-soft/60 px-2.5 py-1.5 rounded-full"
            >
              {h}
            </li>
          ))}
        </ul>
      </Block>

      <Block title="이런 대목이 나와">
        {sample ? (
          <div className="bg-cream-warm rounded-2xl px-4 py-3.5">
            {/* 발췌는 실제 리포트와 같은 마크다운 렌더를 탄다 — 그냥 넣으면 **볼드**가 별표로 뜬다. */}
            <MarkdownLite text={sample} className="text-[13px] text-eye-purple leading-[1.85]" />
            <p className="text-[11px] text-lilac-mid mt-2">예시 · 실제 리포트는 네 사주로 다시 쓰여</p>
          </div>
        ) : (
          <div className="bg-cream-warm rounded-2xl px-3 py-3.5">
            {samplePreview}
            <p className="text-[11px] text-lilac-mid mt-2 px-1">예시 · 실제 결과는 네 사주로 그려져</p>
          </div>
        )}
      </Block>

      {related.length > 0 && (
        <Block title="같이 보면 좋은 것">
          <div className="flex gap-2">
            {related.map((t) => {
              const f = FORTUNE_CONFIG[t];
              return (
                <Link
                  key={t}
                  href={f.href}
                  className="flex-1 bg-white rounded-2xl border border-lilac-mid/20 p-3 flex flex-col items-center gap-1.5 active:scale-[0.99] transition"
                >
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: FORTUNE_GRADIENTS[t] }}
                  >
                    <FortuneIcon type={t} size={34} />
                  </span>
                  <span className="text-[12px] font-bold text-eye-purple text-center leading-tight">{f.label}</span>
                  <span className="text-[10px] text-text-light/70">⭐ {f.cost}</span>
                </Link>
              );
            })}
          </div>
        </Block>
      )}
    </>
  );
}
