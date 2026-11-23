import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { checkShownPrice, tarotPrice, validShownPrice } from "./pricing.ts";
import { SPREAD_INFO, type SpreadType } from "./spreads.ts";

test("tarotPrice — 모든 스프레드의 상품 정가", () => {
  for (const spread of Object.keys(SPREAD_INFO) as SpreadType[]) {
    assert.ok(Number.isInteger(tarotPrice(spread)) && tarotPrice(spread) > 0);
    assert.equal(tarotPrice(spread), SPREAD_INFO[spread].starCost);
  }
});

test("checkShownPrice — 숫자는 일치해야 하고 누락·이상한 값은 통과", () => {
  assert.equal(checkShownPrice({ expected: 10, actual: 10 }), "ok");
  assert.equal(checkShownPrice({ expected: 15, actual: 10 }), "changed");
  assert.equal(checkShownPrice({ expected: 0, actual: 10 }), "changed");
  for (const expected of [undefined, null, "10", -1, 1.5, NaN, Infinity, {}]) {
    assert.equal(validShownPrice(expected), null);
    assert.equal(checkShownPrice({ expected, actual: 10 }), "ok");
  }
  assert.equal(validShownPrice(0), 0);
  assert.equal(validShownPrice(10), 10);
});

// 타로 가격 읽기를 공통 함수로 유지하는 소스 계약.
const ROOT = join(import.meta.dirname, "..", "..");
const PRICE_FILE = "lib/tarot/pricing.ts";

/** 우리 사이 스킬 가격 읽기 — RELATIONSHIP_SKILLS[].starCost(lib/relationship/skills.ts)는 이름만 같은 다른 필드다.
 *  파일째 풀지 않는다: ThreadDrawModal·chat route 는 SPREAD_INFO 도 같이 쓰니, 파일을 풀면 그 안의 SPREAD_INFO[…].starCost 가 새 나간다.
 *  그래서 파일마다 "starCost 를 읽는 변수 이름"까지 못 박는다 — 받는 쪽이 목록 밖의 이름이거나 식(SPREAD_INFO[x].starCost)이면 걸린다.
 *  lib/relationship/* 는 정의(starCost: 45)만 있고 읽는 곳이 없어 목록에 없다. */
const SKILL_PRICE_READS: Record<string, string[]> = {
  // 서버 — 스킬 실행 때 스킬 가격 차감·환불(스킬 가격은 그룹과 무관)
  "app/api/relationship/chat/route.ts": ["drawSkill", "skill"],
  // 입력창 ⚡ 스킬 시트의 가격 칩
  "components/relationship/SkillSheet.tsx": ["s"],
  // 스레드 안 스킬 확인 시트의 가격·충전 안내
  "components/relationship/ThreadChat.tsx": ["pendingSkill", "skill"],
  // 스레드 안 카드 뽑기 모달의 가격·충전 안내(같은 파일의 `info = SPREAD_INFO[spread]` 는 accent·cardCount 만 읽는다)
  "components/relationship/ThreadDrawModal.tsx": ["skill"],
};

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
}

// 주석 속 언급(`SPREAD_INFO.starCost` 를 설명하는 문장)은 읽기가 아니다
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** 한 파일에서 starCost 를 읽는 자리의 "받는 쪽" 이름들. 정의(`starCost: 10`)는 읽기가 아니라 뺀다.
 *  멤버 접근(`x.starCost`·`x?.starCost`)은 바로 앞 변수 이름, 그 밖(`SPREAD_INFO[x].starCost`·`f()?.starCost`·구조 분해·`["starCost"]`)은 "(식)". */
function starCostReceivers(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\.\s*starCost\b|(?<![\w$.])starCost\b(?!\s*:)/g)) {
    if (m[0].startsWith(".")) {
      const before = src.slice(0, m.index).match(/([A-Za-z_$][\w$]*)\s*\??\s*$/);
      out.push(before ? before[1] : "(식)");
    } else {
      out.push("(식)");
    }
  }
  return out;
}

test("타로 스프레드 가격은 tarotPrice 하나 — starCost 를 lib/tarot/pricing.ts 밖에서 읽지 않는다(우리 사이 스킬 가격만 변수 이름까지 못 박아 예외)", () => {
  const files: string[] = [];
  for (const d of ["app", "components", "lib"]) walk(join(ROOT, d), files);
  const reads: Record<string, string[]> = {};
  for (const f of files) {
    const got = starCostReceivers(stripComments(readFileSync(f, "utf8")));
    if (got.length > 0) reads[relative(ROOT, f).split(sep).join("/")] = [...new Set(got)].sort();
  }
  // 기준점이 사라지면(pricing.ts 가 옮겨 가거나 읽기를 그만두면) 이 계약이 빈 스캔으로 통과한다
  assert.ok(reads[PRICE_FILE], `${PRICE_FILE} 가 starCost 를 안 읽는다 — 상품 가격을 읽는 유일한 자리가 사라졌다. 계약의 기준 파일을 새로 정할 것`);
  delete reads[PRICE_FILE];

  const problems: string[] = [];
  for (const [file, receivers] of Object.entries(reads)) {
    for (const r of receivers) {
      if (!SKILL_PRICE_READS[file]?.includes(r)) {
        problems.push(`${file} — ${r}.starCost 읽기: 타로 가격이면 tarotPrice(spread) 로 바꿀 것 · 우리 사이 스킬 가격이면 SKILL_PRICE_READS 에 이유와 함께 등록`);
      }
    }
  }
  for (const [file, receivers] of Object.entries(SKILL_PRICE_READS)) {
    for (const r of receivers) {
      if (!reads[file]?.includes(r)) problems.push(`${file} — 허용 목록의 ${r}.starCost 가 코드에 없다. 목록에서 지울 것(남은 항목은 구멍이 된다)`);
    }
  }
  assert.deepEqual(
    problems,
    [],
    `타로 스프레드 가격을 tarotPrice 밖에서 읽으면 서버 차감·화면이 어긋날 수 있다:\n  ${problems.join("\n  ")}`
  );
});
