// 랜딩 본문 4섹션 — 궁금 / 목차 / 샘플 / 관련상품. 상품 종류를 모르는 순수 표시 컴포넌트.
import Link from "next/link";
import type { ReactNode } from "react";
import { OUTLINE_VISIBLE } from "@/lib/fortune/outline";
import { FortuneIcon } from "@/components/fortune/FortuneIcon";
import { FORTUNE_CONFIG, FORTUNE_GRADIENTS, type FortuneType } from "@/lib/fortune/types";

function Block({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="w-full max-w-md mx-auto px-5 mt-6">
      <h2 className="text-[14.5px] font-bold text-eye-purple">{title}</h2>
      {sub && <p className="text-[11px] text-lilac-mid mt-0.5">{sub}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
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
  const shown = outline.slice(0, OUTLINE_VISIBLE);
  const restCount = outline.length - shown.length;

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

      <Block
        title="리포트에 담기는 것"
        sub={[`${outline.length}개 섹션`, lengthHint].filter(Boolean).join(" · ")}
      >
        <ol className="bg-white rounded-2xl border border-lilac-mid/20 px-4 divide-y divide-lilac-soft/70">
          {shown.map((h) => (
            <li key={h} className="text-[13px] text-eye-purple py-2.5">{h}</li>
          ))}
          {restCount > 0 && (
            <li className="text-[13px] text-text-light/60 py-2.5">그 외 {restCount}개</li>
          )}
        </ol>
      </Block>

      <Block title="이런 대목이 나와">
        {sample ? (
          <div className="bg-cream-warm rounded-2xl px-4 py-3.5">
            <p className="text-[13px] text-eye-purple leading-[1.85] whitespace-pre-line">{sample}</p>
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
