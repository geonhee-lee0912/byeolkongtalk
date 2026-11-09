// 이 브랜치 전용 — 이모지 변환(스펙 §2.1). 줄 하나의 코드 부분(줄 끝 주석 제외)을 받는다.
import type { IconName } from "../../components/common/icon-glyphs";

/** 기호 하나만 든 JSX 칸 → 면 아이콘 이름 */
export const GLYPH_ICON: Record<string, IconName> = {
  "✕": "close", "×": "close", "›": "chev_r", "→": "chev_r", "←": "back", "‹": "back",
  "⭐": "star", "✓": "check", "✅": "check", "★": "rate_on", "☆": "rate_off",
  "▾": "chev_d", "▼": "chev_d", "💡": "bulb", "⏳": "hourglass", "🤍": "heart_safe",
  "💬": "bubble", "🎁": "gift", "💗": "heart", "❤": "heart", "❤️": "heart", "♥": "heart", "💜": "heart",
  "👍": "thumb_up", "👎": "thumb_dn", "🔍": "search", "⚖️": "scale", "👥": "people", "💌": "mail", "⚠️": "warn", "⚠": "warn",
  "🍀": "clover", "🧭": "compass", "🎨": "palette", "🌱": "sprout", "💞": "hearts2", "💔": "heart_broken",
};

const SEQ = "(?:\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic})*\\uFE0F?|[✦✓✕★☆⭐×♥])";

/** `>✕<` 처럼 기호 하나만 든 칸을 <Icon /> 으로. 바뀐 줄과 아이콘 수. */
export function glyphCellsToIcon(code: string, size = 16): { code: string; count: number } {
  let count = 0;
  const re = new RegExp(`>(\\s*)(${SEQ}|[›→←‹▾▼])(\\s*)<`, "gu");
  const out = code.replace(re, (m, a: string, g: string, b: string) => {
    const name = GLYPH_ICON[g] ?? GLYPH_ICON[g.replace(/️/g, "")];
    if (!name) return m;
    count++;
    return `>${a}<Icon name="${name}" size={${size}} />${b}<`;
  });
  return { code: out, count };
}

/** 문장·라벨 속 장식 이모지를 지운다(앞뒤 공백 하나 함께). 끝에 붙은 텍스트 화살표 " →"·" ›" 도. */
export function stripDecor(code: string): string {
  let s = code.replace(new RegExp(`[ \\u00A0]?${SEQ}(?=["'\`<]|$)`, "gu"), ""); // 끝에 붙은 장식은 앞 공백째
  s = s.replace(new RegExp(`${SEQ}[ \\u00A0]?`, "gu"), "");
  s = s.replace(/[  ]+(→|›)(?=\s*["'`<]|\s*$)/g, "");
  return s;
}
