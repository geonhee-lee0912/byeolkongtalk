import React from "react";
import Icon from "@/components/common/Icon";

// 경량 마크다운 — 신뢰된 LLM 출력 전용(중첩·이스케이프 미지원). dangerouslySetInnerHTML 안 씀.
export type InlinePart = { t: "text"; s: string } | { t: "b"; s: string } | { t: "hl"; s: string };
export type Block =
  | { t: "p"; parts: InlinePart[] }
  | { t: "ul"; items: InlinePart[][] }
  | { t: "callout"; parts: InlinePart[] };

/** **볼드** 와 ==하이라이트== 런을 분리.
 *  🔴 하나의 정규식으로 **한 번에** 훑는다 — 볼드를 먼저 다 쪼갠 뒤 각 조각에서 하이라이트를 찾으면
 *     두 문법이 걸친 경우 순서에 따라 결과가 달라진다. 중첩은 여전히 미지원(신뢰된 LLM 출력 전용). */
export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const re = /\*\*(.+?)\*\*|==(.+?)==/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: "text", s: text.slice(last, m.index) });
    // m[1] = 볼드 본문 / m[2] = 하이라이트 본문. 어느 한쪽만 채워진다(교대 그룹).
    parts.push(m[1] !== undefined ? { t: "b", s: m[1] } : { t: "hl", s: m[2] });
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

/** 문단/불릿(- )/콜아웃(> ) 분리. 줄 단위로 런을 끊어, 빈 줄 없이 한 블록에 섞인 경우
 * (도입 문장 + 불릿, 불릿 + 콜아웃)도 각각 렌더한다 — "불릿이 줄글로 이어붙는" 버그 방지.
 * 연속된 같은 종류 줄은 하나로 묶고(불릿 여러 개 = 한 리스트), 긴 문단은 자동 분할. */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let ul: InlinePart[][] = [];
  let quote: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    for (const chunk of splitLongParagraph(para.join(" "))) {
      blocks.push({ t: "p", parts: parseInline(chunk) });
    }
    para = [];
  };
  const flushUl = () => {
    if (!ul.length) return;
    blocks.push({ t: "ul", items: ul });
    ul = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    blocks.push({ t: "callout", parts: parseInline(quote.join(" ").trim()) });
    quote = [];
  };

  // JSON 문자열로 받는 리포트에서 AI 가 줄을 안 바꾸고 문장 끝에 바로 "> 팁" 을 붙이는 일이 있다(dev 성적표 11-21 — '>' 가 글자로 보였다).
  // 문장 끝(.!?…) 바로 뒤의 '>' 만 줄머리로 내린다 — "A > B" 비교·"->" 화살표는 문장 끝 뒤가 아니라 그대로 글.
  const lines = text.replace(/([.!?…])[ \t]+>[ \t]?/g, "$1\n> ").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushPara();
      flushUl();
      flushQuote();
    } else if (line.startsWith("- ")) {
      const item = line.slice(2).trim();
      if (!item) continue; // 빈 불릿 무시
      flushPara();
      flushQuote();
      ul.push(parseInline(item));
    } else if (line.startsWith(">")) {
      const q = line.replace(/^>\s?/, "").trim();
      if (!q) continue; // 빈 콜아웃 무시
      flushPara();
      flushUl();
      quote.push(q);
    } else {
      flushUl();
      flushQuote();
      para.push(line);
    }
  }
  flushPara();
  flushUl();
  flushQuote();

  return blocks.length ? blocks : [{ t: "p", parts: [{ t: "text", s: text }] }];
}

function renderInline(parts: InlinePart[], key: string, tone: "light" | "dark" = "light") {
  return parts.map((p, i) =>
    p.t === "b" ? (
      // 라이트(흰 카드): 진보라 굵게 + 금색 얇은 밑줄. 다크(별콩이 한마디 남색 카드): 밝은 굵은 글자 + 같은 밑줄
      // — 타로 말풍선·후속 창(EmphasisText light/dark)과 같게. 디자인 다듬기 운세 결과 ③(라이트)·⑤(다크, 옛 흰 상자) 운영자 11-16
      <strong
        key={`${key}-${i}`}
        className={tone === "dark" ? "font-bold text-cream" : "font-bold text-eye-purple"}
        // design-allow: 형광펜 밑줄(기능)
        style={{ background: "linear-gradient(transparent 72%, rgba(242, 215, 138, 0.5) 72%, rgba(242, 215, 138, 0.5) 92%, transparent 92%)" }}
      >
        {p.s}
      </strong>
    ) : p.t === "hl" ? (
      // 🔴 볼드와 **다른 결**이어야 한다 — 볼드는 이미 굵기 + 골드 형광펜을 함께 쓴다(위).
      //    하이라이트는 굵기 없이 연보라 칩 배경만 얹어 "본문 안의 짚고 가는 말" 정도로 눌러 둔다.
      //    둘을 같은 모양으로 만들면 문법이 두 개인 이유가 사라진다.
      <mark
        key={`${key}-${i}`}
        className="rounded-sm px-1 py-px"
        style={
          tone === "dark"
            ? { background: "rgba(232, 222, 245, 0.18)", color: "#ECE3FB" }
            : { background: "rgba(212, 199, 238, 0.45)", color: "inherit" }
        }
      >
        {p.s}
      </mark>
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
  /** "dark" = 남색 카드(별콩이 한마디)용 — 볼드를 밝은 글자 + 금색 얇은 밑줄로. */
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
                    className="w-4 h-4 rounded-lg flex items-center justify-center"
                    style={{ background: "#E8DEF5" }}
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
              background: "#FBF3DE",
              border: "1px solid rgba(232, 194, 106, 0.4)",
            }}
          >
            <span className="shrink-0 text-15" aria-hidden><Icon name="bulb" size={16} /></span>
            <p className="text-13 leading-relaxed" style={{ color: "#6A5A3A" }}>
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
