import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dirname, "..");
// Node.js/Vercel 이 제공하므로 로컬 템플릿에 선언하지 않는다.
const ALLOW = new Set(["NODE_ENV", "VERCEL_ENV"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    // 테스트의 환경변수 조작·합성 소스는 실행 코드의 계약 대상이 아니다.
    return /\.[cm]?[jt]sx?$/.test(entry.name) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

function envKeys(code: string, fileName: string): Set<string> {
  const keys = new Set<string>();
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
  const isEnv = (node: ts.Node): boolean =>
    ts.isPropertyAccessExpression(node) && node.name.text === "env" &&
    ts.isIdentifier(node.expression) && node.expression.text === "process";

  function visit(node: ts.Node) {
    if (ts.isPropertyAccessExpression(node) && isEnv(node.expression)) {
      keys.add(node.name.text);
    } else if (ts.isElementAccessExpression(node) && isEnv(node.expression) &&
      ts.isStringLiteral(node.argumentExpression)) {
      keys.add(node.argumentExpression.text);
    } else if (ts.isVariableDeclaration(node) && node.initializer &&
      isEnv(node.initializer) && ts.isObjectBindingPattern(node.name)) {
      for (const element of node.name.elements) {
        if (element.dotDotDotToken) continue;
        const name = element.propertyName ?? element.name;
        if (ts.isIdentifier(name) || ts.isStringLiteral(name)) keys.add(name.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return keys;
}

test("실행 코드가 읽는 환경변수는 .env.local.template 에 모두 선언된다", () => {
  // 실제 소스에 아직 없는 접근 형태도 스캐너가 놓치지 않도록 함께 검증한다.
  assert.deepEqual([...envKeys(`
    process.env.DOT;
    process.env["DOUBLE"];
    process.env['SINGLE'];
    const { PLAIN, ALIASED: local, DEFAULTED = "", ...rest } = process.env;
    // process.env.COMMENT
    const text = "process.env.STRING";
    process.env[dynamicKey];
  `, "fixture.ts")].sort(), ["ALIASED", "DEFAULTED", "DOT", "DOUBLE", "PLAIN", "SINGLE"]);

  const templateKeys = new Set(
    [...readFileSync(join(ROOT, ".env.local.template"), "utf8")
      .matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)]
      .map((match) => match[1])
  );
  assert.ok(templateKeys.size > 0, "환경변수 템플릿 파싱 결과가 비었다");
  const files = [
    ...["app", "lib", "components"].flatMap((dir) => sourceFiles(join(ROOT, dir))),
    join(ROOT, "proxy.ts"),
  ];
  const missing: string[] = [];
  for (const file of files) {
    for (const key of envKeys(readFileSync(file, "utf8"), file)) {
      if (!ALLOW.has(key) && !templateKeys.has(key)) {
        missing.push(`${key} (${relative(ROOT, file)})`);
      }
    }
  }
  assert.deepEqual(missing.sort(), [],
    `.env.local.template 에 환경변수를 추가할 것:\n${missing.sort().join("\n")}`);
});
