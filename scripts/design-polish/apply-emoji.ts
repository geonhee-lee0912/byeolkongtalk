// 이 브랜치 전용 — 이모지 변환 적용. node --import tsx scripts/design-polish/apply-emoji.ts [--dry]
// 기호 하나 칸 → <Icon />, 문장·라벨 장식 → 지움. 그림 자리 데이터(icon/emoji 필드)는 비우고 목록으로 출력(렌더 자리는 손으로).
import { readFileSync, writeFileSync } from "node:fs";
import { sources } from "../../lib/design-scan";
import { glyphCellsToIcon, stripDecor } from "./emoji";

const dry = process.argv.includes("--dry");
const ALLOW = new Set([
  "lib/claude.ts", "lib/byeolmaru/narrative-prompt.ts", "lib/fortune/prompt.ts", "lib/emotion-persona.ts", "lib/relationship/sim.ts",
  "components/saju/ShareButtons.tsx", "components/tarot/TarotShareButtons.tsx", "lib/kakao-share.ts", "lib/byeolmaru/day-label.ts",
  "lib/push/templates.ts", "lib/analytics/route-labels.ts",
]);
/** 여러 줄 주석(/* … *\/) 안의 줄 번호(0부터) */
function blockCommentLines(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/\/\*[\s\S]*?\*\//g)) {
    const a = text.slice(0, m.index).split("\n").length - 1;
    const b = a + m[0].split("\n").length - 1;
    for (let i = a; i <= b; i++) out.add(i);
  }
  return out;
}
// 공유·복사 문구 줄(파일: [시작, 끝] 1부터)
const PROTECT: Record<string, [number, number][]> = { "app/fortune/result/page.tsx": [[80, 176], [360, 396]] };
const EMO = /[\p{Extended_Pictographic}✦✓✕★☆→←▾▼›]/u;
const DATA_FIELD = /\b(icon|emoji|glyph|mark)\s*:\s*["'`]/;
const COMMENT = /^\s*(\/\/|\*|\/\*|\{\/\*)/;
let lines = 0, icons = 0;
const data: string[] = [];
const left: string[] = [];

for (const p of sources()) {
  const f = p.replace(/\\/g, "/");
  if (ALLOW.has(f)) continue;
  const text = readFileSync(p, "utf8");
  if (!EMO.test(text)) continue;
  const L = text.split("\n");
  let changed = false, needIcon = false;
  const inBlock = blockCommentLines(text);
  L.forEach((line, i) => {
    if (inBlock.has(i) || COMMENT.test(line) || line.includes("design-allow:") || line.includes("shareText:")) return;
    if ((PROTECT[f] ?? []).some(([a, b]) => i + 1 >= a && i + 1 <= b)) return;
    const m = line.match(/^(.*?)(\s\/\/\s.*)?(\r?)$/)!;
    let code = m[1];
    const tail = (m[2] ?? "") + m[3];
    if (!EMO.test(code)) return;
    if (f.endsWith(".tsx")) {
      const g = glyphCellsToIcon(code, 16);
      if (g.count) { code = g.code; icons += g.count; needIcon = true; }
    }
    if (DATA_FIELD.test(code)) data.push(`${f}:${i + 1}  ${code.trim().slice(0, 90)}`);
    const next = stripDecor(code);
    if (EMO.test(next)) left.push(`${f}:${i + 1}  ${next.trim().slice(0, 110)}`);
    if (next + tail !== line) { L[i] = next + tail; changed = true; lines++; }
  });
  if (!changed) continue;
  let out = L.join("\n");
  if (needIcon && !/import Icon from "@\/components\/common\/Icon"/.test(out)) {
    const idx = L.reduce((acc, l, j) => (/^import\s/.test(l) ? j : acc), -1);
    let j = idx;
    while (j >= 0 && !/;\s*\r?$/.test(L[j])) j++;
    const eol = L[0]?.endsWith("\r") ? "\r" : "";
    const arr = out.split("\n");
    arr.splice(j + 1, 0, `import Icon from "@/components/common/Icon";${eol}`);
    out = arr.join("\n");
  }
  if (!dry) writeFileSync(p, out);
}
console.log(`바뀐 줄 ${lines} · 아이콘 ${icons}`);
console.log(`비운 그림 자리 데이터 ${data.length}`);
for (const d of data) console.log("  D " + d);
console.log(`남은 것(손으로) ${left.length}`);
for (const l of left) console.log("  L " + l);
