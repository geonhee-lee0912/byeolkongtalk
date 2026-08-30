import React from "react";

// 경량 마크다운 — 신뢰된 LLM 출력 전용(중첩·이스케이프 미지원). dangerouslySetInnerHTML 안 씀.
export type InlinePart = { t: "text"; s: string } | { t: "b"; s: string };
export type Block = { t: "p"; parts: InlinePart[] } | { t: "ul"; items: InlinePart[][] };

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

/** 빈 줄(\n\n)로 문단 분리, '- ' 로 시작하는 연속 줄은 불릿 리스트로. */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.every((l) => l.startsWith("- "))) {
      blocks.push({ t: "ul", items: lines.map((l) => parseInline(l.slice(2).trim())) });
    } else {
      blocks.push({ t: "p", parts: parseInline(lines.join(" ")) });
    }
  }
  return blocks.length ? blocks : [{ t: "p", parts: [{ t: "text", s: text }] }];
}

function renderInline(parts: InlinePart[], key: string) {
  return parts.map((p, i) =>
    p.t === "b" ? (
      <strong key={`${key}-${i}`} className="font-bold text-eye-purple">
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
        ) : (
          <p key={i} className={i > 0 ? "mt-3" : ""}>
            {renderInline(b.parts, `${i}`)}
          </p>
        )
      )}
    </div>
  );
}
