// 계약: 공유 그림의 자식이 둘 이상인 div 엔 display 가 있다 — 없으면 그림 생성기가 던져 0바이트가 나가고,
// 타입·빌드는 통과한다(사주 공유 그림 — 운영자 11-22 시안17 A).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";

const files = (readdirSync("app", { recursive: true }) as string[])
  .map((f) => `app/${f.replaceAll("\\", "/")}`)
  .filter((f) => /^app\/api\/og\/.*\.tsx$|\/opengraph-image\.tsx$/.test(f));

test("공유 그림: 자식이 둘 이상인 div 에는 display 가 있다", () => {
  assert.ok(files.length > 0);
  const bad: string[] = [];
  for (const f of files) {
    const s = ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const walk = (n: ts.Node): void => {
      if (ts.isJsxElement(n) && n.openingElement.tagName.getText(s) === "div") {
        const kids = n.children.filter(
          (c) => !(ts.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces) && !(ts.isJsxExpression(c) && !c.expression),
        );
        if (kids.length > 1 && !/display:\s*"(flex|contents|none)"/.test(n.openingElement.attributes.getText(s))) {
          bad.push(`${f}:${s.getLineAndCharacterOfPosition(n.getStart(s)).line + 1}`);
        }
      }
      ts.forEachChild(n, walk);
    };
    walk(s);
  }
  assert.deepEqual(bad, []);
});
