// 디자인 다듬기 변환 적용 — 이 브랜치 전용. node --import tsx scripts/design-polish/apply.ts <규칙> [--dry]
// 범위 안 파일(lib/design-rules.test.ts 와 같은 범위)의 따옴표·백틱 안 클래스 토큰만 바꾼다. 주석 줄은 건드리지 않는다.
// 사람이 볼 것(manual)은 `파일:줄  클래스 → 이유` 로 출력한다.
import { readFileSync, writeFileSync } from "node:fs";
import { sources } from "../../lib/design-scan";
import { MAPPERS, type Mapper } from "./map";

const rule = process.argv[2];
const dry = process.argv.includes("--dry");
const mapper: Mapper | undefined = MAPPERS[rule];
if (!mapper) {
  console.error(`규칙: ${Object.keys(MAPPERS).join(" | ")}`);
  process.exit(1);
}

const COMMENT = /^\s*(\/\/|\*|\/\*|\{\/\*)/;
let changed = 0;
const manual: string[] = [];

for (const p of sources()) {
  const text = readFileSync(p, "utf8");
  const lines = text.split("\n");
  let dirty = false;
  lines.forEach((line, i) => {
    if (COMMENT.test(line) || line.includes("design-allow:")) return;
    // 따옴표가 줄 안에서 안 닫히는 템플릿 문자열(여러 줄 className)도 있어 줄 전체의 토큰을 본다 — 변환표에 걸리는 모양만 바뀐다
    // 토큰 = 괄호 밖 글자 + [..] 대괄호 묶음(rgba(..) 처럼 괄호가 든 임의값을 통째로)
    const next = line.replace(/(?:[^\s"'`${}()[\]]|\[[^\]\s"'`]*\])+/g, (tok) => {
      const r = mapper(tok, { line, file: text, lineNo: i });
      if ("manual" in r) {
        manual.push(`${p.replace(/\\/g, "/")}:${i + 1}  ${tok} → ${r.manual}`);
        return tok;
      }
      if (r.to !== tok) changed++;
      return r.to;
    });
    if (next !== line) {
      lines[i] = next;
      dirty = true;
    }
  });
  if (dirty && !dry) writeFileSync(p, lines.join("\n"));
}
console.log(`바뀐 토큰 ${changed}${dry ? " (dry)" : ""}`);
console.log(`사람이 볼 것 ${manual.length}`);
for (const m of manual) console.log("  " + m);
