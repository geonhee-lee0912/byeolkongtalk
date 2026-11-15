// 랜딩 본문 4섹션 — 궁금 / 목차 / 샘플 / 관련상품. 상품 종류를 모르는 순수 표시 컴포넌트.
import Link from "next/link";
import type { ReactNode } from "react";
import { MarkdownLite } from "@/lib/markdown-lite";
import { FortuneIcon } from "@/components/fortune/FortuneIcon";
import { FORTUNE_CONFIG, FORTUNE_GRADIENTS, type FortuneType } from "@/lib/fortune/types";
import Icon from "@/components/common/Icon";

function Block({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="w-full max-w-md mx-auto px-5 mt-6">
      <h2 className="text-15 font-bold text-eye-purple">
        {title}
        {meta && <span className="ml-1.5 text-12 font-semibold text-text-light">{meta}</span>}
      </h2>
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
  return (
    <>
      {/* 질문은 내 말풍선처럼(왼쪽 정렬·진보라) — 회색 글자 나열이 잘 안 읽혔다(디자인 다듬기 묶음 4 설명 페이지, 운영자 11-16).
          오른쪽 정렬은 이 묶음만 반대쪽으로 떠 보여 왼쪽으로 */}
      <Block title="이런 게 궁금하면">
        <div className="flex flex-col items-start gap-2">
          {questions.map((q) => (
            <span key={q} className="max-w-[85%] bg-eye-purple text-white text-14 leading-snug px-3.5 py-2.5 rounded-2xl rounded-bl-sm">
              {q}
            </span>
          ))}
        </div>
      </Block>

      {/* 담기는 것은 번호 목록 — 숫자 칸(섹션 N개·분량)과 칩이 한 상자에 빽빽했다. 숫자는 제목 옆에 작게 */}
      <Block title="리포트에 담기는 것" meta={[`${outline.length}개`, lengthHint].filter(Boolean).join(" · ")}>
        <ol className="card py-1.5">
          {outline.map((item, i) => (
            <li key={item} className={`flex items-center gap-3 py-2.5 ${i ? "border-t border-lilac-soft/70" : ""}`}>
              <span className="w-[22px] h-[22px] rounded-full bg-lilac-soft text-accent text-12 font-extrabold flex items-center justify-center shrink-0 tabular-nums">
                {i + 1}
              </span>
              <span className="text-14 text-eye-purple">{item}</span>
            </li>
          ))}
        </ol>
      </Block>

      <Block title="이런 대목이 나와">
        {sample ? (
          <div className="card">
            {/* 발췌는 실제 리포트와 같은 마크다운 렌더를 탄다 — 그냥 넣으면 **볼드**가 별표로 뜬다. */}
            <MarkdownLite text={sample} className="text-13 text-eye-purple leading-[1.85]" />
            <p className="text-11 text-lilac-mid mt-2">예시 · 실제 리포트는 네 사주로 다시 쓰여</p>
          </div>
        ) : (
          <div className="card">
            {samplePreview}
            <p className="text-11 text-lilac-mid mt-2 px-1">예시 · 실제 결과는 네 사주로 그려져</p>
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
                  className="card flex-1 flex flex-col items-center gap-1.5 active:scale-[0.99] transition"
                >
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: FORTUNE_GRADIENTS[t] }}
                  >
                    <FortuneIcon type={t} size={34} />
                  </span>
                  <span className="text-12 font-bold text-eye-purple text-center leading-tight">{f.label}</span>
                  <span className="text-11 text-text-light"><Icon name="star" size={14} className="inline align-[-2px] mr-0.5" />{f.cost}</span>
                </Link>
              );
            })}
          </div>
        </Block>
      )}
    </>
  );
}
