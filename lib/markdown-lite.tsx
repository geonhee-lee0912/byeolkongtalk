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

function renderInline(parts: InlinePart[], key: string, tone: "light" | "dark" = "light") {
  return parts.map((p, i) =>
    p.t === "b" ? (
      // 라이트(흰 카드): 진보라 볼드 + 골드 형광펜. 다크(별콩이 한마디 남색 카드): 형광펜은 안 보이므로
      // 골드 볼드 텍스트로(대비 확보, 하이라이트 배경 제거).
      <strong
        key={`${key}-${i}`}
        className={tone === "dark" ? "font-bold" : "font-bold text-eye-purple"}
        style={
          tone === "dark"
            ? {
                // 다크 카드: 부분 언더스트라이프는 글자가 안 보여서, 밝은 하이라이트 전체 배경 + 어두운 글자.
                background: "rgba(255, 250, 242, 0.92)",
                color: "#2A1F4D",
                borderRadius: "3px",
                padding: "1px 3px",
                boxDecorationBreak: "clone",
                WebkitBoxDecorationBreak: "clone",
              }
            : { background: "linear-gradient(transparent 58%, rgba(242, 215, 138, 0.55) 58%)" }
        }
      >
        {p.s}
      </strong>
    ) : (
      <React.Fragment key={`${key}-${i}`}>{p.s}</React.Fragment>
    )
  );
}

export function MarkdownLite({
  text,
  className,
  tone = "light",
}: {
  text: string;
  className?: string;
  /** "dark" = 남색 카드(별콩이 한마디)용 — 볼드를 골드 텍스트로. */
  tone?: "light" | "dark";
}) {
  const blocks = parseBlocks(text);
  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.t === "ul" ? (
          <ul key={i} className="flex flex-col gap-2 my-3 leading-[1.7]">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-2.5 items-start">
                <span className="shrink-0 flex h-[1.7em] items-center" aria-hidden>
                  <span
                    className="w-4 h-4 rounded-md flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #E8DEF5, #D4C7EE)" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#9F8AD0" }} />
                  </span>
                </span>
                <span>{renderInline(it, `${i}-${j}`, tone)}</span>
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
            {renderInline(b.parts, `${i}`, tone)}
          </p>
        )
      )}
    </div>
  );
}
