// 이 브랜치 전용 — 버튼 클래스 판별(스펙 §2.6). 고정 문자열 className 하나를 받아 btn 부품으로 바꾼 결과, 또는 건너뛴 이유.
export type ButtonResult = { to: string; kind: "primary" | "secondary" | "text"; size: "lg" | "md" | "sm" } | { skip: string };

const has = (cs: string[], re: RegExp) => cs.some((c) => re.test(c));

// 부품이 정하는 것 — 지운다
const STRIP = [
  /^p[xy]-/, /^h-(\d+|\[[^\]]+\])$/, /^rounded(-\S+)?$/, /^text-(11|12|13|14|15|16|17)$/, /^font-/,
  /^bg-(lilac-deep|eye-purple|accent|white|cream-warm|lilac-soft|transparent)(\/\d+)?$/,
  /^text-(white|accent|eye-purple)$/, /^hover:/, /^active:/, /^transition(-\S+)?$/, /^disabled:opacity-/,
  /^disabled:active:/, /^shadow-/, /^border(-\S+)?$/, /^(block|inline-block|inline-flex|flex|items-center|justify-center|text-center)$/,
  /^gap-(1|1\.5|2)$/,
];

export function toButton(cls: string): ButtonResult {
  if (/\$\{|\?|:\s/.test(cls)) return { skip: "조건부 클래스" };
  const cs = cls.trim().split(/\s+/);
  if (has(cs, /FEE500|#000|bg-black|bg-red|bg-rose|text-red|text-rose/)) return { skip: "규정·위험 버튼" };
  const sized = has(cs, /^(py-(2\.5|3|3\.5|4)|h-(10|11|12|13|14|\[4\dpx\]))$/);
  const small = has(cs, /^py-(1|1\.5|2)$/);
  if (!sized && !small) return { skip: "버튼 크기 아님" };
  const solid = has(cs, /^bg-(lilac-deep|eye-purple|accent)$/) && has(cs, /^text-white$/);
  const soft = has(cs, /^bg-(white|cream-warm|lilac-soft)(\/\d+)?$/) && (has(cs, /^border/) || has(cs, /^text-(accent|eye-purple)$/));
  const bare = (has(cs, /^bg-transparent$/) || !has(cs, /^bg-/)) && has(cs, /^text-(accent|eye-purple)$/) && has(cs, /^w-full$/);
  const kind = solid ? "primary" : soft ? "secondary" : bare ? "text" : null;
  if (!kind) return { skip: "종류 판별 불가" };
  const size = has(cs, /^w-full$/) && sized ? "lg" : small ? "sm" : "md";
  const keep = cs.filter((c) => !STRIP.some((r) => r.test(c)) && !(size === "lg" && c === "w-full"));
  return { to: ["btn", `btn-${kind}`, `btn-${size}`, ...keep].join(" "), kind, size };
}
