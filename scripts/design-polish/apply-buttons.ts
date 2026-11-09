// 이 브랜치 전용 — <button>·<Link>·<a> 의 className 을 btn 부품으로. node --import tsx scripts/design-polish/apply-buttons.ts [--dry]
// 고정 문자열은 toButton 으로 바꾸고, 조건부(탭·페이지 번호·토글 선택 상태)는 진보라+흰 글자 조각의 바탕만 bg-accent 로.
import { readFileSync, writeFileSync } from "node:fs";
import { classBlocks } from "../../lib/design-scan";
import { toButton } from "./buttons";

const dry = process.argv.includes("--dry");
const byFile = new Map<string, { cls: string }[]>();
for (const b of classBlocks(["button", "Link", "a"])) {
  if (!byFile.has(b.file)) byFile.set(b.file, []);
  byFile.get(b.file)!.push(b);
}
const stat: Record<string, number> = {};
const skipped: string[] = [];
const SOLID_PAIR = /(["'`\s])bg-(lilac-deep|eye-purple)(?=\s[^"'`]*\btext-white\b|\stext-white)/g;
const SOLID_PAIR_REV = /(\btext-white\b[^"'`]*\s)bg-(lilac-deep|eye-purple)(?=["'`\s])/g;

for (const [file, blocks] of byFile) {
  let text = readFileSync(file, "utf8");
  for (const { cls } of blocks) {
    if (cls.startsWith('"')) {
      const r = toButton(cls.slice(1, -1));
      if ("to" in r) {
        text = text.replace(cls, `"${r.to}"`);
        stat[`${r.kind}-${r.size}`] = (stat[`${r.kind}-${r.size}`] ?? 0) + 1;
      } else if (r.skip !== "버튼 크기 아님") skipped.push(`${file}  ${r.skip}  ${cls.slice(0, 90)}`);
    } else {
      const next = cls.replace(SOLID_PAIR, "$1bg-accent").replace(SOLID_PAIR_REV, "$1bg-accent");
      if (next !== cls) {
        text = text.replace(cls, next);
        stat["선택 상태 bg-accent"] = (stat["선택 상태 bg-accent"] ?? 0) + 1;
      }
      if (/\bw-full\b/.test(cls) && /\bpy-(2\.5|3|3\.5|4)\b/.test(cls)) skipped.push(`${file}  조건부 큰 버튼(손으로)  ${cls.replace(/\s+/g, " ").slice(0, 110)}`);
    }
  }
  if (!dry) writeFileSync(file, text);
}
console.log(JSON.stringify(stat));
console.log(`손으로 볼 것 ${skipped.length}`);
for (const s of skipped) console.log("  " + s);
