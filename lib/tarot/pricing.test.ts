import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { SPREAD_INFO, type SpreadType } from "./spreads.ts";
import { checkShownPrice, tarotPrice, validShownPrice } from "./pricing.ts";
import { CONTINUATION_DISCOUNT_RATE, continuationPrice } from "../continuation.ts";

const SPREADS = Object.keys(SPREAD_INFO) as SpreadType[];

test("옛 그룹 = SPREAD_INFO.starCost 그대로(지금 prod)", () => {
  for (const s of SPREADS) {
    // 표에 없는 값이 undefined 로 통과하지 않게 — 아래 equal 은 양쪽이 다 undefined 여도 통과한다
    assert.ok(Number.isInteger(tarotPrice(s, "legacy")) && tarotPrice(s, "legacy") > 0, `${s} 가격 없음`);
    assert.equal(tarotPrice(s, "legacy"), SPREAD_INFO[s].starCost, s);
  }
});

test("메뉴판 그룹 — 맛보기 15 · 투 15 · 3장 25 · 깊게(5·6장) 55 · 끝까지(7장) 70 (스펙 §3-2)", () => {
  const byCards: Record<number, number> = { 1: 15, 2: 15, 3: 25, 5: 55, 6: 55, 7: 70 };
  for (const s of SPREADS) {
    // 새 카드 수 스프레드가 생겼는데 표(MENU_PRICE_BY_CARDS)에 안 넣으면 여기서 잡힌다
    assert.ok(Number.isInteger(tarotPrice(s, "menu")) && tarotPrice(s, "menu") > 0, `${s} 가격 없음`);
    assert.equal(tarotPrice(s, "menu"), byCards[SPREAD_INFO[s].cardCount], s);
  }
});

test("투카드·쓰리카드는 두 그룹이 같다", () => {
  for (const s of ["two_card", "three_card"] as SpreadType[]) {
    assert.equal(tarotPrice(s, "menu"), tarotPrice(s, "legacy"), s);
  }
});

// ── 화면이 본 가격 대조(checkShownPrice) — 서버는 화면이 보여 주지 않은 가격을 받지 않는다(배포 순간 낡은 번들) ──
test("checkShownPrice — 화면이 보낸 가격(숫자)이 있으면 서버 가격과 같아야만 통과", () => {
  assert.equal(checkShownPrice({ expected: 15, actual: 15, legacyShown: 10 }), "ok");
  assert.equal(checkShownPrice({ expected: 10, actual: 15, legacyShown: 10 }), "changed"); // 옛 가격을 보고 새 가격이 빠질 뻔
  assert.equal(checkShownPrice({ expected: 20, actual: 15, legacyShown: 15 }), "changed"); // 더 비싸게 보여 줬어도 다르면 막는다
  assert.equal(checkShownPrice({ expected: 0, actual: 0, legacyShown: 10 }), "ok"); // 0 도 화면이 보여 준 값이다
});

test("checkShownPrice — 없으면(이 필드를 모르는 옛 번들) 옛 번들이 보여 줬을 값과 서버 가격이 같을 때만 통과", () => {
  assert.equal(checkShownPrice({ expected: undefined, actual: 10, legacyShown: 10 }), "ok");
  assert.equal(checkShownPrice({ expected: undefined, actual: 15, legacyShown: 10 }), "changed");
});

test("checkShownPrice — 0 이상 정수가 아니면 없는 것으로 본다(이상한 값이 '내가 본 가격' 노릇을 못 한다)", () => {
  for (const bad of [null, "15", 15.5, -15, NaN, Infinity, [15], {}, true]) {
    const label = `${typeof bad}:${String(bad)}`;
    assert.equal(checkShownPrice({ expected: bad, actual: 25, legacyShown: 25 }), "ok", label);
    // 서버 가격이 15 라도 "15"·[15] 는 15 가 아니다 — 없는 것으로 보고 옛 화면 값(10)과 대조해 막힌다
    assert.equal(checkShownPrice({ expected: bad, actual: 15, legacyShown: 10 }), "changed", label);
  }
});

test("validShownPrice — 0 이상 정수만 그 숫자, 그 밖은 null(판정과 WARN 기록이 같은 정규화를 쓴다)", () => {
  assert.equal(validShownPrice(15), 15);
  assert.equal(validShownPrice(0), 0);
  for (const bad of [undefined, null, "15", 15.5, -15, NaN, Infinity, [15], {}, true]) {
    assert.equal(validShownPrice(bad), null, `${typeof bad}:${String(bad)}`);
  }
});

test("checkShownPrice × 실제 가격 — 옛 번들(필드 없음): 옛 그룹은 전부 통과 · 메뉴판 그룹은 가격이 다른 상품만 막힌다", () => {
  const oldBundle = (s: SpreadType, arm: "menu" | "legacy") =>
    checkShownPrice({ expected: undefined, actual: tarotPrice(s, arm), legacyShown: tarotPrice(s, "legacy") });
  // 옛 그룹(반반의 절반 · QA 하네스 기본 유저)은 배포 전 화면 그대로 결제된다
  for (const s of SPREADS) assert.equal(oldBundle(s, "legacy"), "ok", s);
  assert.equal(oldBundle("one_card", "menu"), "changed"); // 화면 10 · 서버 15
  assert.equal(oldBundle("relationship_5", "menu"), "changed"); // 화면 40 · 서버 55
  assert.equal(oldBundle("chakra_7", "menu"), "changed"); // 화면 55 · 서버 70
  assert.equal(oldBundle("two_card", "menu"), "ok"); // 15 = 15
  assert.equal(oldBundle("three_card", "menu"), "ok"); // 25 = 25
});

// 감시 SQL 의 price2 가 가격표의 두 번째 사본이다 — 나중에 가격을 바꾸고 SQL 을 안 고치면 price_mismatch 가 전부 울린다.
test("감시 쿼리(scripts/menu-ab-daily-check.sql) price2 의 그룹별 기대 가격 = tarotPrice", () => {
  const sql = readFileSync(new URL("../../scripts/menu-ab-daily-check.sql", import.meta.url), "utf8");
  const tables = new Map<string, Map<number, number>>();
  for (const m of sql.matchAll(/when\s+'(menu|legacy)'\s+then\s+case\s+cards\s+((?:when\s+\d+\s+then\s+\d+\s*)+)end/g)) {
    const byCards = new Map<number, number>();
    for (const w of m[2].matchAll(/when\s+(\d+)\s+then\s+(\d+)/g)) byCards.set(Number(w[1]), Number(w[2]));
    tables.set(m[1], byCards);
  }
  assert.deepEqual([...tables.keys()].sort(), ["legacy", "menu"]);
  for (const arm of ["menu", "legacy"] as const) {
    for (const s of SPREADS) {
      assert.equal(tables.get(arm)!.get(SPREAD_INFO[s].cardCount), tarotPrice(s, arm), `${arm} ${s}`);
    }
  }
});

// 감시 SQL 은 deep 이어가기를 round(정가 × 배율) 로 대조한다 — 서버 차감은 lib/continuation.ts continuationPrice = Math.round(정가 × 0.6).
// 두 언어의 반올림: Postgres round(numeric) 은 .5 를 0 에서 먼 쪽(양수면 올림) · round(float8) 은 짝수 쪽 · JS Math.round 는 +∞ 쪽.
// SQL 의 정수 × 0.6 은 numeric 이라 양수에선 JS 와 같은 규칙이고, 지금 배율에선 정수 정가 × 0.6 의 소수가 .0·.2·.4·.6·.8 뿐이라 .5 경계 자체가 없다.
// 배율·가격을 바꿔 .5 가 생기거나 SQL 배율이 앱과 달라지면 여기서 먼저 잡는다(.5 면 float 로 바뀐 SQL·JS 가 갈린다).
test("감시 쿼리(scripts/menu-ab-daily-check.sql) deep 이어가기 기대 가격 = continuationPrice(tarotPrice, 'deep') — 같은 배율 · .5 경계 없음", () => {
  const sql = readFileSync(new URL("../../scripts/menu-ab-daily-check.sql", import.meta.url), "utf8");
  const m = sql.match(/when\s+p\.continuation_mode\s*=\s*'deep'\s+then\s+round\(\s*p\.full_price\s*\*\s*(\d*\.\d+)\s*\)/);
  assert.ok(m, "price2 의 `when p.continuation_mode = 'deep' then round(p.full_price * <배율>)` 를 못 찾았다");
  assert.equal(Number(m[1]), CONTINUATION_DISCOUNT_RATE, "SQL 배율 ≠ CONTINUATION_DISCOUNT_RATE");
  // 배율 = n / den (십진 정확) — 정가 × 배율의 소수가 정확히 .5 ⇔ (정가 × n) mod den = den / 2
  const den = 10 ** m[1].split(".")[1].length;
  const n = Math.round(Number(m[1]) * den);
  for (const arm of ["menu", "legacy"] as const) {
    for (const s of SPREADS) {
      const full = tarotPrice(s, arm);
      assert.notEqual((full * n) % den, den / 2, `${arm} ${s}: 정가 ${full} × ${m[1]} 이 .5 로 끝난다 — SQL·JS 반올림이 갈릴 수 있다`);
      // SQL round(numeric) = 십진 정확 계산의 반올림(양수) = floor((정가 × n + den/2) / den)
      assert.equal(continuationPrice(full, "deep"), Math.floor((full * n + den / 2) / den), `${arm} ${s}`);
    }
  }
});

// 감시 SQL 의 price CTE 는 스프레드 → 카드 수의 두 번째 사본이다. 위 price2 계약(카드 수 → 가격)과 이어 붙으면
// 스프레드 → 장수 → 가격 사슬 전체가 tarotPrice 와 묶인다. 새 스프레드를 SPREAD_INFO 에 넣고 SQL 을 안 고치면 cards 가 NULL 이 되어
// 그 리딩이 전부 price_mismatch('기대 가격 없음')로 울린다 — 고장이 아닌데 울리는 쪽이라, 여기서 먼저 잡는다.
test("감시 쿼리(scripts/menu-ab-daily-check.sql) price 의 스프레드 → 카드 수 규칙 = SPREAD_INFO.cardCount", () => {
  const sql = readFileSync(new URL("../../scripts/menu-ab-daily-check.sql", import.meta.url), "utf8");
  const block = sql.match(/case\s+(when\s+(?:rd\.)?spread_type[\s\S]*?)\bend\s+as\s+cards\b/);
  assert.ok(block, "price CTE 의 `case when … spread_type … end as cards` 를 못 찾았다");
  // 규칙 두 모양을 위에서부터 읽는다(SQL case 는 먼저 맞는 절이 이긴다): 이름 일치 / 끝 두 글자 일치
  const rules = [
    ...block[1].matchAll(
      /when\s+(?:rd\.)?spread_type\s*=\s*'([a-z0-9_]+)'\s+then\s+(\d+)|when\s+right\(\s*(?:rd\.)?spread_type\s*,\s*2\s*\)\s*=\s*'(_\d)'\s+then\s+(\d+)/g
    ),
  ].map((m) => (m[1] !== undefined ? { name: m[1], suffix: null, cards: Number(m[2]) } : { name: null, suffix: m[3], cards: Number(m[4]) }));
  // 정규식이 못 읽는 모양의 when 절(예: like '%_5')이 끼면 사본이 어긋난 채 통과하지 않게 — 읽은 규칙 수와 when 수가 같아야 한다
  assert.equal(rules.length, [...block[1].matchAll(/\bwhen\b/g)].length, "price 의 when 절 중 읽지 못한 모양이 있다");
  const sqlCards = (spread: string) =>
    rules.find((r) => r.name === spread || (r.suffix !== null && spread.endsWith(r.suffix)))?.cards;
  for (const s of SPREADS) assert.equal(sqlCards(s), SPREAD_INFO[s].cardCount, `${s} — SQL 의 카드 수가 SPREAD_INFO 와 다르다`);
});

// ── 계약: 타로 스프레드 가격은 tarotPrice 하나다 ──
// SPREAD_INFO[x].starCost 는 옛 그룹의 값이다. 화면·서버가 그걸 직접 읽으면 메뉴판 그룹에서 가격이 어긋난다
// (MENU_AB 를 돌려도 그 지점만 옛 값으로 남아 서버 차감·화면 표시가 갈린다). 읽는 곳은 lib/tarot/pricing.ts 하나.
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
  assert.ok(reads[PRICE_FILE], `${PRICE_FILE} 가 starCost 를 안 읽는다 — 옛 그룹 가격을 읽는 유일한 자리가 사라졌다. 계약의 기준 파일을 새로 정할 것`);
  delete reads[PRICE_FILE];

  const problems: string[] = [];
  for (const [file, receivers] of Object.entries(reads)) {
    for (const r of receivers) {
      if (!SKILL_PRICE_READS[file]?.includes(r)) {
        problems.push(`${file} — ${r}.starCost 읽기: 타로 가격이면 tarotPrice(spread, arm) 로 바꿀 것 · 우리 사이 스킬 가격이면 SKILL_PRICE_READS 에 이유와 함께 등록`);
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
    `타로 스프레드 가격을 tarotPrice 밖에서 읽으면 메뉴판 그룹에서 서버 차감·화면이 어긋난다:\n  ${problems.join("\n  ")}`
  );
});
