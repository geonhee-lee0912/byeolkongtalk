// 이 브랜치 전용 — 흰·크림 카드를 card 부품으로. node --import tsx scripts/design-polish/apply-cards.ts [--dry] [--show]
import { readFileSync, writeFileSync } from "node:fs";
import { classBlocks } from "../../lib/design-scan";
import { toCard } from "./cards";

const dry = process.argv.includes("--dry");
const show = process.argv.includes("--show");
const SHEET_FILE = /(Sheet|Modal|Dialog|Panel|PopupCard)\.tsx$/;
const blocks = classBlocks(["div", "section", "article", "li", "a", "Link", "button", "p", "label", "details", "ul", "header"]);
const byFile = new Map<string, { cls: string; line: number }[]>();
for (const b of blocks) {
  if (!byFile.has(b.file)) byFile.set(b.file, []);
  byFile.get(b.file)!.push({ cls: b.cls, line: b.line });
}
// 감싼 요소(위로 80줄, JSX 여닫기 개수로 찾음)가 카드·판이면 true
const PANEL = /(?<![\w:-])(bg-white|card|card-report|bg-cream)(?![\w/-])|rounded-3xl/;
function nestedInPanel(text: string, lineNo: number): boolean {
  const L = text.split("\n");
  let bal = 0;
  for (let i = lineNo - 2; i >= Math.max(0, lineNo - 80); i--) {
    const l = L[i];
    bal += (l.match(/<[A-Za-z]/g) ?? []).length - (l.match(/<\/[A-Za-z]/g) ?? []).length - (l.match(/\/>/g) ?? []).length;
    if (bal > 0) {
      if (PANEL.test(l) || (PANEL.test(L[i + 1] ?? "") && !/<[A-Za-z]/.test(L[i + 1] ?? ""))) return true;
      bal = 0;
    }
  }
  return false;
}
const stat: Record<string, number> = {};
const manual: string[] = [];
for (const [file, list] of byFile) {
  let text = readFileSync(file, "utf8");
  const sheetFile = SHEET_FILE.test(file);
  const original = text;
  for (const { cls, line } of list) {
    const inSheet = sheetFile || nestedInPanel(original, line);
    if (!cls.startsWith('"')) {
      if (/\brounded-(xl|2xl)\b/.test(cls) && /\bbg-(white|cream-warm)/.test(cls) && /\bp[xy]?-[3-7]/.test(cls)) manual.push(`${file}  조건부  ${cls.replace(/\s+/g, " ").slice(0, 120)}`);
      continue;
    }
    const r = toCard(cls.slice(1, -1), inSheet);
    if ("to" in r) {
      if (show) console.log(`${r.kind.padEnd(11)} ${file}  ${cls.slice(1, 70)}  →  ${r.to.slice(0, 60)}`);
      text = text.replace(cls, `"${r.to}"`);
      stat[r.kind] = (stat[r.kind] ?? 0) + 1;
    }
  }
  if (!dry) writeFileSync(file, text);
}
console.log(JSON.stringify(stat));
console.log(`손으로 볼 것 ${manual.length}`);
for (const m of manual) console.log("  " + m);
