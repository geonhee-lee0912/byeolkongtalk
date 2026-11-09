// 디자인 규칙 훑기 — 사용자 화면 파일에서 규칙 위반 줄을 찾는다. lib/design-rules.test.ts 와 이 브랜치의 변환 스크립트가 같이 쓴다.
// 예외: 파일 전체는 offenders 의 allow, 줄 하나는 그 줄이나 바로 윗줄에 `design-allow: <이유>` 주석.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib"];
// 범위 밖: 어드민·API(OG 포함)·공유 이미지
const OUT_OF_SCOPE = [/^app[\\/]admin[\\/]/, /^components[\\/]admin[\\/]/, /^app[\\/]api[\\/]/, /opengraph-image\.tsx$/, /^lib[\\/]admin/];

export function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !OUT_OF_SCOPE.some((r) => r.test(p))) out.push(p);
    }
  };
  ROOTS.forEach(walk);
  return out;
}

const COMMENT = /^\s*(\/\/|\*|\/\*|\{\/\*)/;
const ALLOW_MARK = "design-allow:";

/** 규칙 위반 `파일:줄` 목록. 주석 줄, `design-allow:` 표시 줄(또는 바로 아랫줄), allow 파일은 건너뛴다. */
export function offenders(re: RegExp, allow: string[] = []): string[] {
  const hits: string[] = [];
  for (const p of sources()) {
    const norm = p.replace(/\\/g, "/");
    if (allow.some((a) => norm === a || (a.endsWith("/") && norm.startsWith(a)))) continue;
    const lines = readFileSync(p, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (COMMENT.test(line)) return;
      if (line.includes(ALLOW_MARK) || (i > 0 && lines[i - 1].includes(ALLOW_MARK))) return;
      if (re.test(line)) hits.push(`${norm}:${i + 1}`);
    });
  }
  return hits;
}
