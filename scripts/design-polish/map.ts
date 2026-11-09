// 디자인 다듬기 변환표 — 이 브랜치 전용(옮기기가 끝나면 폴더째 지운다). 정본은 스펙 §2.2~2.5.
// 클래스 하나를 받아 바꿀 값(to) 또는 사람이 볼 이유(manual)를 돌려준다. 해당 없는 클래스는 그대로(to = 입력).

export type MapResult = { to: string } | { manual: string };
/** 줄·파일 문맥(밤 바탕 판정 등)이 필요한 변환용 */
export type MapContext = { line: string; file: string; lineNo: number };
export type Mapper = (cls: string, ctx: MapContext) => MapResult;

const split = (cls: string): [string, string] => {
  const i = cls.lastIndexOf(":");
  return i >= 0 ? [cls.slice(0, i + 1), cls.slice(i + 1)] : ["", cls];
};

const PX_TO_TEXT: [number, string][] = [
  [11, "text-11"], [12, "text-12"], [13, "text-13"], [14, "text-14"], [15, "text-15"],
  [17, "text-17"], [20, "text-20"], [22, "text-22"], [24, "text-22"], [28, "text-28"], [30, "text-28"],
];
const NAMED_TEXT: Record<string, string> = { "text-xs": "text-12", "text-sm": "text-14", "text-xl": "text-20", "text-2xl": "text-22" };
const MANUAL_TEXT: Record<string, string> = {
  "text-base": "16 — 제목 17 · 버튼 15 · 읽는 본문 16 · 그 밖 15",
  "text-lg": "18 — 제목 17 (화면 제목급 20)",
  "text-3xl": "30 — 큰 숫자면 44, 아니면 28",
  "text-4xl": "36 — 큰 숫자면 44, 아니면 28",
};

export function mapTextSize(cls: string): MapResult {
  const [pre, base] = split(cls);
  if (Object.hasOwn(NAMED_TEXT, base)) return { to: pre + NAMED_TEXT[base] };
  if (Object.hasOwn(MANUAL_TEXT, base)) return { manual: MANUAL_TEXT[base] };
  const m = base.match(/^text-\[(\d+(?:\.\d+)?)px\]$/);
  if (!m) return { to: cls };
  const px = Number(m[1]);
  if (px === 16) return { manual: MANUAL_TEXT["text-base"] };
  if (px === 18) return { manual: MANUAL_TEXT["text-lg"] };
  if (px === 44 || px === 52) return { to: `${pre}text-${px}` };
  if (px <= 11) return { to: pre + "text-11" };
  if (px === 19 || px === 20 || px === 21) return { to: pre + (px === 21 ? "text-22" : "text-20") };
  if (px === 26) return { to: pre + "text-28" };
  const up = PX_TO_TEXT.find(([p]) => p >= px);
  return up && (up[0] === Math.ceil(px) || px % 1 !== 0) ? { to: pre + up[1] } : { manual: `${px}px — 표에 없음` };
}

// 모서리 (스펙 §2.3) — 4단계 + 둥근 끝. 바닥 카드 3xl→2xl 같은 역할 판단은 사람이 한다.
export function mapRadius(cls: string): MapResult {
  const [pre, base] = split(cls);
  if (/^rounded(-md|-\[(4|9)px\])?$/.test(base)) return { to: pre + "rounded-lg" };
  if (/^rounded-\[(18|20|22)px\]$/.test(base)) return { to: pre + "rounded-2xl" };
  if (base === "rounded-[50%]") return { to: pre + "rounded-full" };
  const tail = base.match(/^rounded-(tl|tr|bl|br)-md$/);
  if (tail) return { to: `${pre}rounded-${tail[1]}-sm` };
  if (/^rounded-\[/.test(base)) return { manual: "임의 모서리 — 8·12·16·24·full 중 역할로" };
  return { to: cls };
}

// 그림자 (스펙 §2.4)
const TO_CARD = [
  "shadow-sm", "shadow",
  "shadow-[0_2px_10px_rgba(159,138,208,0.07)]", "shadow-[0_2px_10px_rgba(159,138,208,0.08)]",
  "shadow-[0_8px_30px_rgba(40,30,70,0.08)]", "shadow-[0_8px_30px_rgba(40,30,70,0.10)]",
  "shadow-[0_1px_4px_rgba(90,62,140,0.05)]",
];
export function mapShadow(cls: string): MapResult {
  const [pre, base] = split(cls);
  if (TO_CARD.includes(base)) return { to: pre + "shadow-card" };
  if (base === "shadow-[0_-4px_24px_rgba(31,23,53,0.18)]") return { to: pre + "shadow-float-up" };
  if (/^shadow-\[0_8px_32px_rgba\(31,23,53,0\.2[58]\)\]$/.test(base)) return { to: pre + "shadow-modal" };
  if (base.includes("rgba(232,194,106")) return { manual: "골드 빛 — 장식 정리(Task 9)" };
  if (/^shadow-\[0_0_0_/.test(base)) return { manual: "포커스 링 — ring-2 ring-lilac-deep/20 로" };
  if (/^shadow-(md|lg|xl|2xl)$/.test(base)) return { manual: "떠 있는 것 float · 창 modal · 카드 card" };
  if (/^shadow-(lilac|night|lilac-deep|gold)(\/\d+)?$/.test(base)) return { manual: "그림자 색 — 지운다(빛 그림자는 장식)" };
  if (/^shadow-\[/.test(base)) return { manual: "임의 그림자 — card·float·float-up·modal 중" };
  return { to: cls };
}

// 글자색 (스펙 §2.5) — 밤 바탕 위 연보라 글자는 색은 그대로 두고 이름만 accent-on-dark 로
export function mapTextColor(cls: string, onDark: boolean): MapResult {
  const [pre, base] = split(cls);
  if (pre.endsWith("placeholder:") && /^text-text-light(\/\d+)?$/.test(base)) return { to: pre + "text-text-faint" };
  if (/^text-text-light\/\d+$/.test(base)) return { to: pre + "text-text-light" };
  if (/^text-lilac-deep(\/\d+)?$/.test(base)) return { to: pre + (onDark ? "text-accent-on-dark" : "text-accent") };
  return { to: cls };
}

const DARK = /\b(bg-night(-deep)?|card-night|bg-night-card|from-night|bg-\[#1F1735\]|bg-\[#211A33\]|bg-\[#16122E\])\b|#2A1F4D|#1F1735/;
/** 그 줄의 요소나 감싼 요소(위로 60줄까지)가 밤 바탕이면 true. JSX 여닫기 개수로 감싼 요소를 찾는다. */
export function isOnDark(file: string, lineNo: number): boolean {
  const L = file.split("\n");
  if (DARK.test(L[lineNo] ?? "")) return true;
  let bal = 0;
  for (let i = lineNo - 1; i >= Math.max(0, lineNo - 60); i--) {
    const l = L[i];
    const closes = (l.match(/<\/[A-Za-z]/g) ?? []).length + (l.match(/\/>/g) ?? []).length;
    const opens = (l.match(/<[A-Za-z]/g) ?? []).length;
    bal += opens - closes;
    if (bal > 0) {
      if (DARK.test(l)) return true;
      bal = 0;
    }
  }
  return false;
}

export const MAPPERS: Record<string, Mapper> = {
  text: (c) => mapTextSize(c),
  radius: (c) => mapRadius(c),
  shadow: (c) => mapShadow(c),
  color: (c, ctx) => mapTextColor(c, isOnDark(ctx.file, ctx.lineNo)),
};
