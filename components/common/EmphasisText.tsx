"use client";

import { Fragment } from "react";
import { splitEmphasis } from "@/lib/text-emphasis";

// 채팅 버블용 **볼드** 렌더 — 운세 리포트(MarkdownLite light)와 동일 스타일로 통일:
// 진보라 + 골드 하이라이트. 불릿·콜아웃은 대화체·스트리밍에 안 맞아 제외(볼드만).
// 파싱은 splitEmphasis 그대로라 스트리밍(미완 **)도 기존과 동일하게 안전.
export default function EmphasisText({ text }: { text: string }) {
  return (
    <>
      {splitEmphasis(text).map((s, i) =>
        s.bold ? (
          <strong
            key={i}
            className="font-bold text-eye-purple"
            // 형광펜 띠 → 글자 아래 얇은 밑줄(72~92%) — 디자인 다듬기 /tarot/reading ④ 운영자 11-13.
            // 운세 리포트(lib/markdown-lite)는 아직 옛 띠 — 그 화면 차례에 맞출지 본다
            style={{ background: "linear-gradient(transparent 72%, rgba(242, 215, 138, 0.5) 72%, rgba(242, 215, 138, 0.5) 92%, transparent 92%)" }}
          >
            {s.text}
          </strong>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        )
      )}
    </>
  );
}
