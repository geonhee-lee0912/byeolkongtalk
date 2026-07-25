// 테스트 vs 실유저 API 원가 분리 — 하네스 전사 스코어링 + clean-day 캘리브레이션.
//
// 사용:
//   node --import tsx scripts/qa-cost-score.ts 2026-07                       # 하네스 점수만
//   node --import tsx scripts/qa-cost-score.ts 2026-07 <q9> <q9b> <q9dev> <q9d>
//     q9    = prod 실유저 리딩(제외 6명 뺀 것)   — {id,kind,product,persona,stars_spent,d,turns}
//     q9b   = prod 제외 6명 리딩                  — {id,consultation_type,d,d_kst,turns}
//     q9dev = dev DB 리딩                         — 같은 형태
//     q9d   = prod 리딩 id → {d,d_kst} 맵 (q9 의 KST 재버킷용)
//
// 방법: 콘솔 일별 실측(진실)을 "오염 없는 날(clean day)"에서만 유저 점수와 맞춰 단가를 구하고,
//       그 단가로 전체 유저분을 환산한 뒤 나머지를 테스트분으로 돌린다(잔여법).
//       하네스 판정 콜처럼 전사에 안 남는 오버헤드가 자동으로 테스트 쪽에 잡히므로
//       점수 비례 배분보다 정확하다. 하네스 점수는 분리식에 안 들어가고 (a) 오염일 식별
//       (b) 잔여액이 하네스 규모로 설명되는지 교차검증 에만 쓴다.
//
// 하네스 1 케이스의 API 콜 구성 (qa/config.ts · driver.ts · judge.ts · simulator.ts 실측):
//   - 별콩이 응답 = Sonnet, 턴당 1콜, 입력은 전체 히스토리 누적 (full_history)
//   - 판정 = Sonnet, 케이스당 1콜, 입력 = 루브릭 고정분 + 전사 전문
//   - 시뮬레이터 = Haiku, say/idle_resume 턴마다 1콜 + burst 묶음당 1콜 + stop/abandon 1콜
//     (첫 턴은 케이스 스펙 고정 발화라 콜 없음). 입력은 그때까지의 전사 누적.
//   - dev 서버도 prod 와 같은 코드라 [END] 케이스는 next_reco haiku 1콜이 더 붙는다.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { scoreReading, CHARS_PER_TOKEN, type Turn, type CostTrack } from "../lib/analytics/apiCost.ts";

// ── 콘솔 일별 실측 (Anthropic 콘솔, USD) ─────────────────────────────────────
// [Sonnet 5, Haiku 4.5]. 합계 $72.79 / $2.80 (콘솔 표기 $72.8 / $2.8).
const CONSOLE: Record<string, [number, number]> = {
  "2026-07-01": [0, 0], "2026-07-02": [0, 0], "2026-07-03": [0, 0], "2026-07-04": [0, 0],
  "2026-07-05": [0, 0], "2026-07-06": [0, 0], "2026-07-07": [0, 0],
  "2026-07-08": [0.16, 0], "2026-07-09": [0.69, 0], "2026-07-10": [2.08, 0],
  "2026-07-11": [2.16, 0], "2026-07-12": [2.49, 0], "2026-07-13": [3.50, 0.19],
  "2026-07-14": [3.74, 0.09], "2026-07-15": [1.96, 0.02], "2026-07-16": [2.18, 0.03],
  "2026-07-17": [6.94, 0.34], "2026-07-18": [3.88, 0.12], "2026-07-19": [16.83, 1.13],
  "2026-07-20": [5.91, 0.30], "2026-07-21": [3.59, 0.08], "2026-07-22": [6.61, 0.27],
  "2026-07-23": [5.08, 0.13], "2026-07-24": [3.85, 0.09], "2026-07-25": [1.14, 0.01],
};

// ── 페르소나 정적 블록 실측 글자수 (scripts/api-cost-allocate.ts 와 동일 합성) ──
const SEP = "\n\n---\n\n";
const P = (f: string) => readFileSync(join(process.cwd(), "data", "persona", f), "utf-8");
const CORE = P("byeolkong_core.md");
const SYSTEM_CHARS: Record<string, number> = {
  saju: (CORE + SEP + P("byeolkong_saju.md")).length,
  tarot: (CORE + SEP + P("byeolkong_tarot.md")).length,
  relationship: (CORE + SEP + P("byeolkong_relationship.md")).length,
  fortune: P("byeolkong_fortune.md").length, // 운세 one-shot 만 코어 없음
};

// ── 하네스 고정 상수 (추측 아님 — 실제 프롬프트 빌더를 호출해 측정) ──────────
/** qa/evaluate/judge.ts buildJudgePrompt(빈 전사).length — 7차원 루브릭 */
const JUDGE_OVERHEAD = 1_736;
/** 같은 값, 관계 스레드는 R1~R4 4차원이 더 붙는다 */
const JUDGE_OVERHEAD_REL = 2_311;
/** 판정 응답 크기는 전사에 저장된 judge 객체 직렬화 길이로 대체(폴백값) */
const JUDGE_OUT_FALLBACK = 900;
/** qa/simulator.ts buildSimSystemPrompt — 123 케이스 실측 582~677, 평균 612 */
const SIM_SYS_CHARS = 612;
/** 시뮬레이터 이벤트 JSON 래퍼 오버헤드 (`{"type":"say","text":"..."}`) */
const SIM_JSON_WRAP = 30;

// ── prod/dev 공용 보조 haiku 모델 ────────────────────────────────────────────
/** next_reco haiku 태깅 도입일 (supabase/migrations/20260713000000_readings_next_reco.sql) */
const NEXT_RECO_FROM = "2026-07-13";
/** lib/reco.ts — 대화 tail 4000자 + TAG_SCHEMA(≈600자) 입력, 200자 이내 JSON 출력 */
const RECO_IN_CAP = 4_000;
const RECO_SCHEMA_CHARS = 600;
const RECO_OUT_CHARS = 200;
const HAIKU_IN = 1;   // $/MTok
const HAIKU_OUT = 5;

const BASELINE_HIT = 0.6;
const HIT_RATES = [0.3, 0.6, 0.9];

type Day = {
  runs: number; cases: number; turns: number;
  userS: number; userH: number;      // 실유저(prod, 제외 6명 뺀 것)
  qaS: number; qaH: number;          // QA 하네스 전사
  exclS: number; exclH: number;      // prod 제외 6명
  devS: number; devH: number;        // dev DB
  userN: number; exclN: number; devN: number;
};
const blank = (): Day => ({
  runs: 0, cases: 0, turns: 0, userS: 0, userH: 0, qaS: 0, qaH: 0,
  exclS: 0, exclH: 0, devS: 0, devH: 0, userN: 0, exclN: 0, devN: 0,
});

type Tz = "utc" | "kst";
type Table = Record<Tz, Map<string, Day>>;
const newTable = (): Table => ({ utc: new Map(), kst: new Map() });
const get = (t: Table, tz: Tz, day: string): Day => {
  let d = t[tz].get(day);
  if (!d) { d = blank(); t[tz].set(day, d); }
  return d;
};

// ── 공용 스코어러 ────────────────────────────────────────────────────────────
const trackOf = (persona: string): CostTrack => (persona === "relationship" ? "windowed" : "full_history");

function sonnetScore(turns: Turn[], persona: string, hit: number): number {
  return scoreReading({
    turns,
    systemChars: SYSTEM_CHARS[persona] ?? SYSTEM_CHARS.tarot,
    track: trackOf(persona),
    windowMsgs: 24,
    summaryChars: 1_200,
    cacheHitRate: hit,
  }).score;
}

/** next_reco haiku 1콜 (대화형 saju/tarot 리딩, 도입일 이후). 리포트·관계는 라우트가 다르니 0.
 *  ⚠️ 롤링요약(summarizeOlder)은 24메시지 초과 스레드에서만 트리거 —
 *     이 기간 prod/dev/하네스 전체에 해당 스레드가 0건이라 모델에서 제외. */
function haikuRecoScore(day: string, persona: string, kind: string, convChars: number): number {
  if (day < NEXT_RECO_FROM) return 0;
  if (persona === "relationship" || persona === "fortune" || kind === "report") return 0;
  const inTok = (Math.min(convChars, RECO_IN_CAP) + RECO_SCHEMA_CHARS) / CHARS_PER_TOKEN;
  const outTok = RECO_OUT_CHARS / CHARS_PER_TOKEN;
  return (inTok / 1e6) * HAIKU_IN + (outTok / 1e6) * HAIKU_OUT;
}

// ── 1. QA 하네스 전사 ────────────────────────────────────────────────────────
type RawTurn = { userText?: string; assistantText?: string; eventType?: string };
type Tx = {
  caseId?: string;
  product?: { kind?: string };
  turns?: RawTurn[];
  finishReason?: string;
};

/** 디렉토리명 2026-07-19T08-39-21-226Z → ISO 문자열 */
function dirToIso(dir: string): string {
  const [date, time] = dir.split("T");
  if (!time) return `${dir}T00:00:00.000Z`;
  const p = time.replace(/Z$/, "").split("-");
  return `${date}T${p[0]}:${p[1]}:${p[2]}.${p[3] ?? "000"}Z`;
}
const kstDay = (iso: string): string =>
  new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10);

function loadHarness(t: Table, monthPrefix: string, hit: number): void {
  const OUT_DIR = "qa/out";
  if (!existsSync(OUT_DIR)) { console.error("qa/out 없음 — 경로 확인"); return; }

  for (const dir of readdirSync(OUT_DIR)) {
    if (!dir.startsWith(monthPrefix)) continue;
    const iso = dirToIso(dir);
    const days: Record<Tz, string> = { utc: dir.slice(0, 10), kst: kstDay(iso) };
    for (const tz of ["utc", "kst"] as Tz[]) get(t, tz, days[tz]).runs += 1;

    for (const f of readdirSync(join(OUT_DIR, dir))) {
      if (!f.endsWith(".json")) continue;
      let j: { transcript?: Tx; judge?: unknown };
      try {
        j = JSON.parse(readFileSync(join(OUT_DIR, dir, f), "utf8"));
      } catch {
        continue; // 중단된 런의 깨진 파일
      }
      const tx = j.transcript ?? {};
      const raw = tx.turns ?? [];
      if (!raw.length) continue;

      const kind = tx.product?.kind ?? "tarot";
      const persona = kind === "relationship" || kind === "verdict" ? "relationship" : kind;

      // (a) 별콩이 응답 = Sonnet, full_history
      const turns: Turn[] = [];
      for (const t of raw) {
        turns.push({ role: "user", chars: (t.userText ?? "").length });
        turns.push({ role: "assistant", chars: (t.assistantText ?? "").length });
      }
      const convChars = turns.reduce((a, t) => a + t.chars, 0);
      let sonnet = sonnetScore(turns, persona, hit);

      // (b) 판정 = Sonnet 1콜. 출력은 저장된 judge 객체 직렬화 길이로 근사.
      const judgeIn =
        (persona === "relationship" ? JUDGE_OVERHEAD_REL : JUDGE_OVERHEAD) +
        raw.reduce((a, t, i) => a + `### 턴 ${i + 1}\n[사용자] ${t.userText ?? ""}\n[별콩이] ${t.assistantText ?? ""}\n\n`.length, 0);
      const judgeOut = j.judge ? JSON.stringify(j.judge).length : JUDGE_OUT_FALLBACK;
      sonnet += (judgeIn / CHARS_PER_TOKEN / 1e6) * 3 + (judgeOut / CHARS_PER_TOKEN / 1e6) * 15;

      // (c) 시뮬레이터 = Haiku. 콜 수를 eventType 으로 정확히 센다.
      //     첫 턴(=케이스 seedConcern, verdict 는 kickoff+seed)은 콜 없음.
      const firstSim = kind === "verdict" ? 2 : 1;
      let haiku = 0;
      let prevWasBurst = false;
      let ctxChars = 0;
      for (let i = 0; i < raw.length; i++) {
        const t = raw[i];
        const grew = (t.userText ?? "").length + (t.assistantText ?? "").length;
        if (i >= firstSim) {
          const isBurst = t.eventType === "burst";
          const newCall = !isBurst || !prevWasBurst; // burst 묶음은 1콜
          if (newCall) {
            const inTok = (SIM_SYS_CHARS + ctxChars) / CHARS_PER_TOKEN;
            const outTok = ((t.userText ?? "").length + SIM_JSON_WRAP) / CHARS_PER_TOKEN;
            haiku += (inTok / 1e6) * HAIKU_IN + (outTok / 1e6) * HAIKU_OUT;
          }
          prevWasBurst = isBurst;
        }
        ctxChars += grew;
      }
      // 종료를 시뮬레이터가 냈으면([END] 마커 없이 ended, 또는 abandoned) 마지막 1콜 더
      const lastAsst = raw[raw.length - 1]?.assistantText ?? "";
      const simEnded =
        tx.finishReason === "abandoned" ||
        (tx.finishReason === "ended" && !lastAsst.includes("[END]"));
      if (simEnded) {
        haiku += ((SIM_SYS_CHARS + ctxChars) / CHARS_PER_TOKEN / 1e6) * HAIKU_IN + (25 / CHARS_PER_TOKEN / 1e6) * HAIKU_OUT;
      }
      // (d) dev 서버도 [END] 케이스엔 next_reco haiku 1콜
      haiku += haikuRecoScore(days.utc, persona, "chat", convChars);

      for (const tz of ["utc", "kst"] as Tz[]) {
        const d = get(t, tz, days[tz]);
        d.cases += 1;
        d.turns += raw.length;
        d.qaS += sonnet;
        d.qaH += haiku;
      }
    }
  }
}

// ── 2. DB 리딩 (prod 유저 / prod 제외6 / dev) ────────────────────────────────
type DbRow = {
  id: string; d: string; d_kst?: string;
  kind?: string; persona?: string; consultation_type?: string;
  turns: Turn[];
};
type Bucket = "user" | "excl" | "dev";

function loadDb(t: Table, rows: DbRow[], bucket: Bucket, hit: number, kstMap?: Map<string, string>): void {
  for (const r of rows) {
    const persona = r.persona ?? (r.consultation_type === "relationship" ? "relationship" : r.consultation_type ?? "tarot");
    const kind = r.kind ?? "chat";
    const s = sonnetScore(r.turns, persona, hit);
    const convChars = r.turns.reduce((a, t) => a + t.chars, 0);
    const days: Record<Tz, string> = {
      utc: r.d,
      kst: r.d_kst ?? kstMap?.get(r.id) ?? r.d,
    };
    for (const tz of ["utc", "kst"] as Tz[]) {
      const day = days[tz];
      const h = haikuRecoScore(day, persona, kind, convChars);
      const d = get(t, tz, day);
      if (bucket === "user") { d.userS += s; d.userH += h; d.userN += 1; }
      else if (bucket === "excl") { d.exclS += s; d.exclH += h; d.exclN += 1; }
      else { d.devS += s; d.devH += h; d.devN += 1; }
    }
  }
}

// ── 3. 캘리브레이션 ──────────────────────────────────────────────────────────
type Split = {
  unit: number; cleanDays: string[]; cleanConsole: number; cleanScore: number;
  userUsd: number; testUsd: number; total: number;
};

/** 콘솔 실측이 있는 25일 전체 (활동 0인 날도 표에 남긴다) */
const ALL_DAYS = Object.keys(CONSOLE).sort();
const dayOf = (t: Table, tz: Tz, day: string): Day => t[tz].get(day) ?? blank();

/** clean = 하네스 실행 없음 + 제외6 활동 없음 + dev 활동 없음.
 *  relaxed 는 제외6 이 2건 이하인 날까지 포함 — 엄격 clean 표본이 3일뿐이라 강건성 확인용. */
const isCleanDay = (d: Day, relaxed: boolean): boolean =>
  d.cases === 0 && d.runs === 0 && d.devN === 0 && d.exclN <= (relaxed ? 2 : 0);

function calibrate(t: Table, tz: Tz, line: "sonnet" | "haiku", relaxed = false): Split {
  const consoleOf = (day: string) => CONSOLE[day][line === "sonnet" ? 0 : 1];
  const scoreOf = (d: Day) => (line === "sonnet" ? d.userS : d.userH);

  const clean: string[] = [];
  let cc = 0, cs = 0, totalScore = 0, total = 0;
  for (const day of ALL_DAYS) {
    const d = dayOf(t, tz, day);
    totalScore += scoreOf(d);
    total += consoleOf(day);
    // 유저 점수 0 인 날은 0/0 이라 단가 정보가 없다 (haiku 는 도입 전 날들이 여기 해당)
    if (isCleanDay(d, relaxed) && scoreOf(d) > 0) { clean.push(day); cc += consoleOf(day); cs += scoreOf(d); }
  }
  const unit = cs > 0 ? cc / cs : 0;
  const userUsd = unit * totalScore;
  return { unit, cleanDays: clean, cleanConsole: cc, cleanScore: cs, userUsd, testUsd: total - userUsd, total };
}

// ── 4. 실행 ──────────────────────────────────────────────────────────────────
const [, , monthPrefix = "2026-07", q9Path, q9bPath, q9devPath, q9dPath] = process.argv;
const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const hasDb = Boolean(q9Path);
if (hasDb && !q9dPath) console.warn("⚠️ q9d(KST 맵) 미지정 — 유저 점수의 KST 뷰는 UTC 와 동일하게 폴백된다.");
const kstMap = q9dPath
  ? new Map(readJson<{ id: string; d_kst: string }[]>(q9dPath).map((r) => [r.id, r.d_kst]))
  : undefined;

/** 한 캐시 히트율 가정으로 표 전체를 새로 만든다 (히트율 민감도용으로 여러 번 호출). */
function build(hit: number): Table {
  const t = newTable();
  loadHarness(t, monthPrefix, hit);
  if (q9Path) {
    loadDb(t, readJson<DbRow[]>(q9Path), "user", hit, kstMap);
    if (q9bPath) loadDb(t, readJson<DbRow[]>(q9bPath), "excl", hit);
    if (q9devPath) loadDb(t, readJson<DbRow[]>(q9devPath), "dev", hit);
  }
  return t;
}

const table = build(BASELINE_HIT);

console.log("=== 페르소나 정적 블록 실측 글자수 ===");
for (const [k, v] of Object.entries(SYSTEM_CHARS)) console.log(`  ${k.padEnd(13)}${String(v).padStart(7)}자`);

for (const tz of (hasDb ? (["utc", "kst"] as Tz[]) : (["utc"] as Tz[]))) {
  const sSplit = hasDb ? calibrate(table, tz, "sonnet") : null;
  const hSplit = hasDb ? calibrate(table, tz, "haiku") : null;

  console.log(`\n=== ${tz.toUpperCase()} 기준 일별 대조표 (캐시 히트율 ${BASELINE_HIT}) ===`);
  console.log(
    "날짜".padEnd(11) + "콘솔S".padStart(7) + "콘솔H".padStart(7) +
    "유저건".padStart(6) + "유저S점".padStart(9) + "유저H점".padStart(9) +
    "런".padStart(4) + "케이스".padStart(6) + "하네스S점".padStart(10) + "하네스H점".padStart(10) +
    "제외6".padStart(6) + "dev".padStart(5) + "clean".padStart(7) +
    (sSplit ? "추정유저$".padStart(10) + "잔여$".padStart(8) : "")
  );
  for (const day of ALL_DAYS) {
    const d = dayOf(table, tz, day);
    const [cS, cH] = CONSOLE[day];
    const isClean = isCleanDay(d, false);
    const estUser = sSplit ? sSplit.unit * d.userS : 0;
    console.log(
      day.padEnd(11) + cS.toFixed(2).padStart(7) + cH.toFixed(2).padStart(7) +
      String(d.userN).padStart(6) + d.userS.toFixed(3).padStart(9) + d.userH.toFixed(4).padStart(9) +
      String(d.runs).padStart(4) + String(d.cases).padStart(6) +
      d.qaS.toFixed(3).padStart(10) + d.qaH.toFixed(4).padStart(10) +
      String(d.exclN).padStart(6) + String(d.devN).padStart(5) +
      (isClean ? "  clean" : isCleanDay(d, true) ? "     ~" : "      ").padStart(7) +
      (sSplit ? estUser.toFixed(2).padStart(10) + (cS - estUser).toFixed(2).padStart(8) : "")
    );
  }
  // 합계
  const sum = <K extends keyof Day>(k: K) => ALL_DAYS.reduce((a, day) => a + (dayOf(table, tz, day)[k] as number), 0);
  console.log(
    "합계".padEnd(11) +
    ALL_DAYS.reduce((a, day) => a + CONSOLE[day][0], 0).toFixed(2).padStart(7) +
    ALL_DAYS.reduce((a, day) => a + CONSOLE[day][1], 0).toFixed(2).padStart(7) +
    String(sum("userN")).padStart(6) + sum("userS").toFixed(3).padStart(9) + sum("userH").toFixed(4).padStart(9) +
    String(sum("runs")).padStart(4) + String(sum("cases")).padStart(6) +
    sum("qaS").toFixed(3).padStart(10) + sum("qaH").toFixed(4).padStart(10) +
    String(sum("exclN")).padStart(6) + String(sum("devN")).padStart(5)
  );

  if (!sSplit || !hSplit) continue;

  for (const [name, sp] of [["Sonnet", sSplit], ["Haiku", hSplit]] as const) {
    console.log(`\n--- ${tz.toUpperCase()} / ${name} clean-day 캘리브레이션 ---`);
    console.log(`  clean days (${sp.cleanDays.length}개): ${sp.cleanDays.join(", ") || "(없음)"}`);
    console.log(`  단가 = 콘솔 $${sp.cleanConsole.toFixed(2)} / 유저점수 ${sp.cleanScore.toFixed(3)} = ${sp.unit.toFixed(4)} ($/점수)`);
    console.log(`  실유저 = ${sp.unit.toFixed(4)} × 전체점수 → $${sp.userUsd.toFixed(2)} (${((sp.userUsd / sp.total) * 100).toFixed(1)}%)`);
    console.log(`  테스트 = $${sp.total.toFixed(2)} − $${sp.userUsd.toFixed(2)} = $${sp.testUsd.toFixed(2)} (${((sp.testUsd / sp.total) * 100).toFixed(1)}%)`);
  }

  // ── 강건성 1: relaxed clean (제외6 ≤2건 인 날까지 표본에 포함) ────────────
  for (const [name, line] of [["Sonnet", "sonnet"], ["Haiku", "haiku"]] as const) {
    const r = calibrate(table, tz, line, true);
    const strict = line === "sonnet" ? sSplit : hSplit;
    console.log(
      `\n  [강건성] ${name} relaxed clean ${r.cleanDays.length}일 → 단가 ${r.unit.toFixed(4)} ` +
      `(엄격 ${strict.unit.toFixed(4)}, 차이 ${(((r.unit / strict.unit) - 1) * 100).toFixed(1)}%) ` +
      `→ 실유저 $${r.userUsd.toFixed(2)} (${((r.userUsd / r.total) * 100).toFixed(1)}%) / 테스트 $${r.testUsd.toFixed(2)}`
    );
    console.log(`     표본일: ${r.cleanDays.join(", ")}`);
  }

  // ── 강건성 2: 잔여가 하네스 실행일에 집중되는가 ───────────────────────────
  // 잔여법이 옳다면 하네스 없는 날의 잔여는 0 근방(노이즈)이어야 한다.
  {
    let onQa = 0, offQa = 0, offQaAbs = 0, offQaDays = 0;
    for (const day of ALL_DAYS) {
      const d = dayOf(table, tz, day);
      const resid = CONSOLE[day][0] - sSplit.unit * d.userS;
      if (d.runs > 0) onQa += resid;
      else if (CONSOLE[day][0] > 0) { offQa += resid; offQaAbs += Math.abs(resid); offQaDays += 1; }
    }
    console.log(
      `\n  [강건성] Sonnet 잔여 집중도 — 하네스일(7일) 잔여 $${onQa.toFixed(2)} / ` +
      `비하네스일(${offQaDays}일) 잔여 $${offQa.toFixed(2)} (절대값 합 $${offQaAbs.toFixed(2)}, 일평균 오차 $${(offQaAbs / offQaDays).toFixed(2)})`
    );
    console.log(`     → 테스트 잔여 $${sSplit.testUsd.toFixed(2)} 의 ${((onQa / sSplit.testUsd) * 100).toFixed(0)}% 가 하네스 실행일에 집중`);
  }

  // ── 강건성 3: 하네스 점수를 같은 단가로 환산해 잔여와 맞대본다 ─────────────
  {
    const qaS = ALL_DAYS.reduce((a, day) => a + dayOf(table, tz, day).qaS, 0);
    const pred = qaS * sSplit.unit;
    console.log(
      `\n  [강건성] 하네스 전사 점수 ${qaS.toFixed(2)} × 단가 ${sSplit.unit.toFixed(4)} = $${pred.toFixed(2)} ` +
      `vs 테스트 잔여 $${sSplit.testUsd.toFixed(2)} → 하네스 모델이 잔여의 ${((pred / sSplit.testUsd) * 100).toFixed(0)}% 를 설명(독립 추정)`
    );
  }

  // ── 검산 게이트: 7/19 지문 ────────────────────────────────────────────────
  const D = "2026-07-19";
  const d19 = table[tz].get(D);
  if (d19) {
    const cS = CONSOLE[D][0], cH = CONSOLE[D][1];
    const uS = sSplit.unit * d19.userS, uH = hSplit.unit * d19.userH;
    const testShare = ((cS + cH - uS - uH) / (cS + cH)) * 100;
    console.log(`\n=== 검산 게이트 — ${D} 지문 (${tz.toUpperCase()}) ===`);
    console.log(`  콘솔 $${(cS + cH).toFixed(2)} (S ${cS} + H ${cH}) / 유저 리딩 ${d19.userN}건 · 하네스 런 ${d19.runs} · 케이스 ${d19.cases}`);
    console.log(`  추정 실유저 $${(uS + uH).toFixed(2)} → 테스트 귀속 $${(cS + cH - uS - uH).toFixed(2)} = ${testShare.toFixed(1)}%`);
    console.log(`  게이트(≥60%): ${testShare >= 60 ? "PASS" : "FAIL"}`);
    console.log(`  교차검증 — 하네스 점수로 본 그날 테스트분: S ${d19.qaS.toFixed(2)} / H ${d19.qaH.toFixed(3)} (잔여 S $${(cS - uS).toFixed(2)} / H $${(cH - uH).toFixed(3)})`);
  }

}

// ── 민감도: 캐시 히트율 ─────────────────────────────────────────────────────
// 같은 스코어러가 분자(clean day 단가)와 분모(전체 점수)에 모두 쓰이므로 공통 배율은
// 상쇄된다 → 히트율 가정이 분리 비율을 거의 못 움직이는지 확인하는 게이트.
if (hasDb) {
  console.log(`\n=== 민감도 — 캐시 히트율 ${HIT_RATES.join("/")} (UTC 기준) ===`);
  for (const hit of HIT_RATES) {
    const t = build(hit);
    const s = calibrate(t, "utc", "sonnet");
    const h = calibrate(t, "utc", "haiku");
    console.log(
      `  hit ${hit}: Sonnet 단가 ${s.unit.toFixed(4)} → 실유저 $${s.userUsd.toFixed(2)} (${((s.userUsd / s.total) * 100).toFixed(1)}%) / 테스트 $${s.testUsd.toFixed(2)}` +
      ` | Haiku 실유저 $${h.userUsd.toFixed(2)} (${((h.userUsd / h.total) * 100).toFixed(1)}%)`
    );
  }
}
