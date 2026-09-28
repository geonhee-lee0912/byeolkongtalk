// 랜딩 본문 4섹션 — 궁금 / 목차 / 샘플 / 관련상품. 상품 종류를 모르는 순수 표시 컴포넌트.
import Link from "next/link";
import type { ReactNode } from "react";
import { MarkdownLite } from "@/lib/markdown-lite";
import { splitLengthHint } from "@/lib/fortune/outline";
import OutlineChips from "./OutlineChips";
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

/** 숫자를 크게 세우는 칸 — 섹션 수·분량. "이만큼 받는다"가 한눈에 읽혀야 하는 자리다.
 *  라벨과 숫자를 한 줄에 두고 baseline 을 맞춘다(두 줄로 쌓으면 높이만 먹는다). */
function Stat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div className="flex-1 flex items-baseline justify-center gap-2">
      <span className="text-[11px] text-text-light/70 shrink-0">{label}</span>
      <span className="font-display text-[19px] text-eye-purple leading-none whitespace-nowrap">
        {value}
        <span className="text-[11.5px] ml-0.5">{unit}</span>
      </span>
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
        {/* 숫자와 칩을 한 상자에 — 흰 카드 여러 개가 흩어지면 지면이 부산해진다. */}
        <div className="bg-white rounded-2xl border border-lilac-mid/20 overflow-hidden">
          <div className="flex items-stretch divide-x divide-lilac-soft/70 py-2.5">
            <Stat value={String(outline.length)} unit="개" label="섹션" />
            {/* 분량 힌트가 없는 종목(무료 MBTI)은 섹션 칸만 — 빈 칸을 만들지 않는다. */}
            {len && <Stat value={len.value} unit={len.unit} label="분량" />}
          </div>
          <div className="border-t border-lilac-soft/70 px-3.5 py-3">
            <OutlineChips items={outline} />
          </div>
        </div>
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
