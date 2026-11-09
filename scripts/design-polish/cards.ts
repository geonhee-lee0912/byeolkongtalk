// 이 브랜치 전용 — 카드 클래스 판별(스펙 §2.7). 고정 문자열 className 하나 → card / card-report / card-inner, 또는 건너뛴 이유.
export type CardResult = { to: string; kind: "card" | "card-report" | "card-inner" } | { skip: string };

const has = (cs: string[], re: RegExp) => cs.some((c) => re.test(c));
const STRIP = [
  /^bg-(white|cream-warm)(\/\d+|\/\[[\d.]+\])?$/, /^border(-\S+)?$/, /^hover:border(-\S+)?$/, /^rounded(-(xl|2xl|3xl))?$/,
  /^shadow-\S+$/, /^hover:shadow-\S+$/, /^p[xy]?-(\d+(\.\d+)?|\[\d+px\])$/, /^backdrop-blur(-\S+)?$/,
];

/** inSheet: 시트·창·패널 파일이거나 감싼 요소가 카드·판(바닥이 아니라 이미 다른 판 위) */
export function toCard(cls: string, inSheet: boolean): CardResult {
  if (/\$\{|\?|:\s/.test(cls)) return { skip: "조건부" };
  const cs = cls.trim().split(/\s+/);
  if (has(cs, /^(btn|card|card-report|card-inner|card-night)$/)) return { skip: "이미 부품" };
  if (!has(cs, /^rounded-(xl|2xl|3xl)$/)) return { skip: "카드 모서리 아님" };
  const white = has(cs, /^bg-white(\/\d+|\/\[[\d.]+\])?$/);
  const cream = has(cs, /^bg-cream-warm(\/\d+)?$/);
  if (!white && !cream) return { skip: "흰·크림 바탕 아님" };
  if (has(cs, /^(bg-gradient|text-white|rounded-full|from-)/)) return { skip: "그라데이션·밤·알약" };
  if (has(cs, /^(shadow-float|shadow-float-up|shadow-modal|max-w-(xs|sm|md|lg))$/)) return { skip: "떠 있는 것·창 판" };
  if (has(cs, /^(w|h|size)-(\d+|\[\d+px\])$/) && !has(cs, /^w-full$/)) return { skip: "고정 크기 타일" };
  const padded = has(cs, /^p-(3|3\.5|4|5|6|7)$/) || (has(cs, /^px-(3|3\.5|4|5|6|\[\d+px\])$/) && has(cs, /^py-(2|2\.5|3|3\.5|4|5|6)$/));
  if (!padded) return { skip: "안쪽 여백 없음" };
  const inner = inSheet;
  const report = !inner && (has(cs, /^px-\[22px\]$/) || has(cs, /^py-6$/) || has(cs, /^p-(5|6|7)$/));
  const kind = inner ? "card-inner" : report ? "card-report" : "card";
  const keep = cs.filter((c) => !STRIP.some((r) => r.test(c)));
  return { to: [kind, ...keep].join(" "), kind };
}
