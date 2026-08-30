import React from "react";

// 경량 마크다운 — 신뢰된 LLM 출력 전용(중첩·이스케이프 미지원). dangerouslySetInnerHTML 안 씀.
export type InlinePart = { t: "text"; s: string } | { t: "b"; s: string };
export type Block =
  | { t: "p"; parts: InlinePart[] }
  | { t: "ul"; items: InlinePart[][] }
  | { t: "callout"; parts: InlinePart[] };

/** **볼드** 런을 분리. */
export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: "text", s: text.slice(last, m.index) });
    parts.push({ t: "b", s: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: "text", s: text.slice(last) });
  return parts.length ? parts : [{ t: "text", s: text }];
}

// 너무 긴 문단(문장 4개 초과)은 3문장씩 묶어 자동 분할 — LLM 이 문단을 안 나눴거나
// 구 저장본(마크다운 없음)일 때의 가독성 안전망. 4문장 이하 문단은 그대로 둔다.
const MAX_SENT = 4;
const CHUNK = 3;
export function splitLongParagraph(text: string): string[] {
  const sentences = text.split(/(?<=[.!?…])\s+/).filter((s) => s.trim());
  if (sentences.length <= MAX_SENT) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += CHUNK) {
    chunks.push(sentences.slice(i, i + CHUNK).join(" "));
  }
  return chunks;
}

/** 빈 줄(\n\n)로 문단 분리, '- ' 로 시작하는 연속 줄은 불릿 리스트로. 긴 문단은 자동 분할. */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.every((l) => l.startsWith("- "))) {
      blocks.push({ t: "ul", items: lines.map((l) => parseInline(l.slice(2).trim())) });
    } else if (lines.every((l) => l.startsWith(">"))) {
      const quote = lines.map((l) => l.replace(/^>\s?/, "")).join(" ").trim();
      blocks.push({ t: "callout", parts: parseInline(quote) });
    } else {
      for (const chunk of splitLongParagraph(lines.join(" "))) {
        blocks.push({ t: "p", parts: parseInline(chunk) });
      }
    }
  }
  return blocks.length ? blocks : [{ t: "p", parts: [{ t: "text", s: text }] }];
}

function renderInline(parts: InlinePart[], key: string) {
  return parts.map((p, i) =>
    p.t === "b" ? (
      <strong
        key={`${key}-${i}`}
        className="font-bold text-eye-purple"
        style={{ background: "linear-gradient(transparent 58%, rgba(242, 215, 138, 0.55) 58%)" }}
      >
        {p.s}
      </strong>
    ) : (
      <React.Fragment key={`${key}-${i}`}>{p.s}</React.Fragment>
    )
  );
}

export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.t === "ul" ? (
          <ul key={i} className="flex flex-col gap-1.5 my-2.5">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-2">
                <span className="shrink-0 text-lilac-deep font-bold">·</span>
                <span>{renderInline(it, `${i}-${j}`)}</span>
              </li>
            ))}
          </ul>
        ) : b.t === "callout" ? (
          <div
            key={i}
            className="my-3 flex gap-2.5 rounded-2xl px-4 py-3"
            style={{
              background: "linear-gradient(135deg, #FBF3DE, #F7EAF3)",
              border: "1px solid rgba(232, 194, 106, 0.4)",
            }}
          >
            <span className="shrink-0 text-[15px]" aria-hidden>💡</span>
            <p className="text-[13px] leading-relaxed" style={{ color: "#6A5A3A" }}>
              {renderInline(b.parts, `co-${i}`)}
            </p>
          </div>
        ) : (
          <p key={i} className={i > 0 ? "mt-3" : ""}>
            {renderInline(b.parts, `${i}`)}
          </p>
        )
      )}
    </div>
  );
}
