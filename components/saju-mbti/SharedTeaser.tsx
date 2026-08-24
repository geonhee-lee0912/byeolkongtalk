"use client";

import { useEffect } from "react";
import type { ResultTokens } from "@/lib/saju-mbti/share-tokens";
import { TYPE_CONTENT } from "@/lib/saju-mbti/content";
import { matchRate } from "@/lib/saju-mbti/match";
import type { AxisResult, PaljaType } from "@/lib/saju-mbti/mapping";
import type { SelfType } from "@/lib/saju-mbti/self-type";
import type { AxisKey, Pole } from "@/lib/saju-mbti/constants";
import { ResultView } from "./ResultView";

// 4자 코드 → 축별 극 (조립 규칙: 음양·강유·재인·생단 순, codes.ts 와 동일)
function axesFromCode(code: string): Record<AxisKey, AxisResult> {
  const c = [...code];
  const mk = (pole: string): AxisResult => ({ raw: 0, pct: 0, pole: pole as Pole });
  return { yinYang: mk(c[0]), strength: mk(c[1]), wealth: mk(c[2]), nurture: mk(c[3]) };
}

// 공유 링크로 들어온 친구용. 토큰(팔자·자아 코드 + 밴드 + 오행)만으로 재구성해
// ResultView 를 shared 모드로 재사용한다. 명식·오각·4축 게이지는 생년월일이 필요해
// 토큰에 없다(무영속·PII) → shared 모드가 그 블록을 숨긴다.
export function SharedTeaser({ tokens, onStart }: { tokens: ResultTokens; onStart: () => void }) {
  const content = TYPE_CONTENT[tokens.paljaCode];
  useEffect(() => {
    if (!content) onStart();
  }, [content, onStart]);
  if (!content) return null;

  const paljaAxes = axesFromCode(tokens.paljaCode);
  const selfAxes = axesFromCode(tokens.selfCode);
  const palja: PaljaType = {
    axes: paljaAxes,
    code: tokens.paljaCode,
    element: tokens.element,
    elementDist: { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 },
    tenGods: [],
    jangan: [],
  };
  const self: SelfType = { axes: selfAxes, code: tokens.selfCode };
  const match = matchRate(selfAxes, paljaAxes);

  return <ResultView shared palja={palja} self={self} match={match} onStart={onStart} />;
}
