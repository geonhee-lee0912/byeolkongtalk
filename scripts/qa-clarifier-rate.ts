// scripts/qa-clarifier-rate.ts — QA 트랜스크립트에서 '카드 한 장 더' 제안 비율·위반을 센다 (spec 2026-10-04 §4·§5·§7).
// 실행: node --import tsx scripts/qa-clarifier-rate.ts qa/out/<runId> [qa/out/<runId2> ...]
//
// 센 것
//  - 제안 = 별콩이 턴의 [RECO:tarot:clarifier] 마커. 두 갈래로 가른다 — 그 턴의 유저 말이 카드를 더·다시 봐 달라는 요청이면 '유저 요청 제안'(user-initiated),
//    아니면 '먼저 꺼낸 제안'(proactive). 목표 20~35%·대화당 1회 규칙은 별콩이가 스스로 꺼낸 제안 얘기고(spec §3-5 ②),
//    유저 요청에 응한 안내는 페르소나 '더 보고 싶다' 경로라 별개다 — 유저가 두 번 졸라서 두 번 안내한 건 위반이 아니다
//  - convs / offered / pct   비위기 대화 수 · 먼저 꺼낸 제안이 있는 대화 수 · 비율. 위기 케이스(caseId 에 "crisis")는 분모에서 뺀다. 목표 20~35% (spec §4)
//  - 위반(하나라도 있으면 종료 코드 1)
//      multi                대화당 먼저 꺼낸 제안이 2회 이상(대화당 1회 규칙)
//      priceViolations      제안 턴(먼저 꺼낸 것·유저 요청 모두)에 별·가격·결제 언급
//      crisisViolations     위기 대화의 제안 — 위기 케이스, 또는 서버가 민감 헤더(X-Sensitive-Category)를 준 턴 이후의 제안
//      questionEndingOffers 제안 턴(먼저 꺼낸 것·유저 요청 모두)이 물음표로 끝남 — 제안 문장은 평서형 끝말이어야 한다(마커 제거 후 기준)
//  - INFO
//      userInitiated        유저 요청 제안 — 턴 수(userInitiatedTurns) · 대화 수(userInitiatedConvs) · 목록(유저 말 포함). 정규식 분류라 목록을 눈으로 확인할 것
//      offeredAny / pctAny  유저 요청 제안까지 합친 대화 수·비율(참고용)
//      convsNonAbandon      정상 대화 중 유저가 중간에 떠난(finishReason=abandoned) 대화를 뺀 수 — offeredNonAbandon / pctNonAbandon 은 그 분모 기준 비율
//      offerWithoutPhrase   제안 마커가 있는데 본문에 '한 장 더' 제안 문구가 없음 — 안내 없이 칩만 뜬다(서버는 문구만 있고 마커가 없는 쪽만 고친다)
//      offerNotLastLine     제안 마커가 맨 끝 단독 줄이 아님(칩은 뜨지만 spec §3-5 ② 형식 이탈)
//      farewellOnKeepOpen   열어 둔 턴인데 작별 문구가 남음(spec §7 리스크) — 표본을 찍는다
//      keepOpenStreaks      대화마다 연속으로 열어 둔 턴의 길이 분포(길이 → 연속 구간 수) — ⑥ 연쇄가 얼마나 이어지나
//      candidateConvs       '한 장 더' 후보 턴이 있었던 대화 수 — 서버 판정의 근사(자유 구간 · 유저가 묻는 중 · 아직 제안 전). 단답 연속·위기는 반영 안 함
//      excluded             분모에서 뺀 대화 수 — 정상(200)이 아닌 응답이 끼었거나(레이트리밋 429 등 — 턴이 유실돼 비율이 낮게 나온다) 하네스 오류. 목록을 찍는다
//      bySpread             스프레드별 convs / offered / offeredAny / pct / pctAny
// '열어 둔 턴' = X-Wrap-Mode 헤더가 hardcap 이고 [END] 가 없는 턴(자연 마무리선에서 서버가 [END] 를 떼거나 모델이 안 붙인 턴 — spec §3-3).
// 제안 마커는 클라가 칩을 띄우는 눈(parseAllRecoMarkers — 대소문자 무시)과 같게 본다.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Transcript, TurnRecord } from "../qa/types.ts";
import { parseAllRecoMarkers } from "../lib/reco-utils.ts";
import { classifyUserTurn } from "../lib/tarot/user-turn.ts";

const MARKERS_RE = /\[(?:END|CARD:\d+|RECO:[a-z0-9_:]+)\]/gi;
const PRICE_RE = /⭐|\d+\s*(별|원)|별\s*\d+|가격|결제|충전/;
const OFFER_PHRASE_RE = /한\s*장\s*(?:을\s*)?더/; // 서버 repairClarifierMarker 가 보는 제안 문구와 같다
const MARKER_LAST_LINE_RE = /\n[ \t]*\[RECO:tarot:clarifier\]\s*$/i;
// 끝말 장식(공백·따옴표·닫는 괄호·~·ㅎㅋㅠㅜ·이모지와 그 이음 문자)을 뗀 뒤 ?/？(+!)로 끝나면 질문 마무리다 — "?" 로 끝나는 것의 상위 집합(장식이 붙은 물음표도 잡는다)
const TAIL_DECOR_RE = /[\s"'“”‘’)\]」』~ㅎㅋㅠㅜ\p{Extended_Pictographic}\p{Variation_Selector}\p{Join_Control}]+$/u;
const FAREWELLS: [label: string, re: RegExp][] = [
  ["다음에 또", /다음에\s*또/],
  ["또 와", /또\s*와(?![가-힣])/],
  ["오늘은 여기까지", /오늘은\s*여기까지/],
  ["또 보자", /또\s*보자/],
  ["잘 자", /잘\s*자(?![가-힣])/],
  ["안녕", /안녕(?!하)/], // 안녕하세요 는 인사라 뺀다
];

const isOffer = (x: TurnRecord): boolean => parseAllRecoMarkers(x.assistantText).includes("tarot:clarifier");
// 유저가 카드를 더·다시 봐 달라고 한 말 — "카드 더 뽑아줘" · "카드 한 번 더 봐줄 수 있어?" · "한 장 더". 표본을 가르는 필터일 뿐이라 분류된 목록을 찍어 눈으로 확인한다
const asksMoreCards = (userText: string): boolean =>
  /한\s*장\s*더/.test(userText) || (/카드/.test(userText) && /더|다시|한\s*번|뽑/.test(userText));
const hasEnd = (s: string): boolean => /\[END\]/i.test(s);
const visible = (s: string): string => s.replace(MARKERS_RE, "").trim();
const endsWithQuestion = (s: string): boolean => /[?？][!！]*$/.test(s.replace(TAIL_DECOR_RE, ""));
const isKeptOpen = (x: TurnRecord): boolean => x.headers["x-wrap-mode"] === "hardcap" && !hasEnd(x.assistantText);
const tail = (s: string, n = 140): string => {
  const v = visible(s).replace(/\s+/g, " ");
  return v.length > n ? `…${v.slice(-n)}` : v;
};
const pctOf = (a: number, b: number): number => (b ? Math.round((1000 * a) / b) / 10 : 0);

// 같은 caseId 가 여러 런에 있으면 뒤에 준 디렉토리가 이긴다(재실행한 배치가 앞 런을 덮는다) — 이중 집계 방지
const byCase = new Map<string, { t: Transcript; dir: string }>();
for (const dir of process.argv.slice(2)) {
  for (const f of readdirSync(dir).filter((x) => x.startsWith("tarot.") && x.endsWith(".json"))) {
    const t = (JSON.parse(readFileSync(join(dir, f), "utf8")) as { transcript: Transcript }).transcript;
    const prev = byCase.get(t.caseId);
    if (prev) console.log(`[dup] ${t.caseId}: ${prev.dir} → ${dir} 로 교체`);
    byCase.set(t.caseId, { t, dir });
  }
}

let convs = 0;
let offered = 0; // 먼저 꺼낸 제안이 있는 대화
let offeredAny = 0; // 유저 요청 제안까지 합쳐 제안이 있는 대화(참고)
let userInitiatedTurns = 0;
let userInitiatedConvs = 0;
let convsNonAbandon = 0;
let offeredNonAbandon = 0;
let multi = 0;
let priceViolations = 0;
let crisisViolations = 0;
let questionEndingOffers = 0;
let offerWithoutPhrase = 0;
let offerNotLastLine = 0;
let farewellOnKeepOpen = 0;
let keepOpenTurns = 0;
let candidateConvs = 0;
const keepOpenStreaks: Record<number, number> = {};
const bySpread: Record<string, { convs: number; offered: number; offeredAny: number }> = {};
const offerLines: string[] = [];
const userInitLines: string[] = [];
const violationLines: string[] = [];
const formatLines: string[] = [];
const farewellLines: string[] = [];
const excludedLines: string[] = [];

for (const { t } of byCase.values()) {
  const offerAt = t.turns.flatMap((x, i) => (isOffer(x) ? [i] : []));
  const userInitAt = offerAt.filter((i) => asksMoreCards(t.turns[i].userText)); // 유저가 더 봐 달라고 한 턴의 안내
  const proactiveAt = offerAt.filter((i) => !userInitAt.includes(i)); // 별콩이가 먼저 꺼낸 제안
  const sensitiveAt =t.turns.findIndex((x) => !!x.headers["x-sensitive-category"]);

  if (t.caseId.includes("crisis")) {
    // 위기 대화는 비율 분모에서 빼고, 제안이 하나라도 있으면 위반
    if (offerAt.length > 0) {
      crisisViolations++;
      violationLines.push(`[위기] ${t.caseId} t${offerAt[0] + 1}: ${tail(t.turns[offerAt[0]].assistantText)}`);
    }
    continue;
  }
  // 턴이 유실된 대화(리딩 생성 실패 · 레이트리밋 429 · 하네스 오류)는 뒤쪽 후보 턴을 못 봤으니 분모에 넣으면 비율이 낮게 나온다 — 빼고 목록으로 남긴다
  const statuses = t.turns.reduce<Record<number, number>>((m, x) => ({ ...m, [x.status]: (m[x.status] ?? 0) + 1 }), {});
  if (t.turns.length === 0 || t.finishReason === "error" || Object.keys(statuses).some((s) => Number(s) !== 200)) {
    excludedLines.push(`${t.caseId}: ${t.finishReason} · 상태 ${JSON.stringify(statuses)}${t.error ? ` · ${t.error.slice(0, 80)}` : ""}`);
    continue;
  }

  convs++;
  const spread = t.product.kind === "tarot" ? t.product.spreadType : t.product.kind;
  const sp = (bySpread[spread] ??= { convs: 0, offered: 0, offeredAny: 0 });
  sp.convs++;
  const abandoned = t.finishReason === "abandoned";
  if (!abandoned) convsNonAbandon++;
  if (offerAt.length > 0) {
    offeredAny++;
    sp.offeredAny++;
  }
  if (proactiveAt.length > 0) {
    offered++;
    sp.offered++;
    if (!abandoned) offeredNonAbandon++;
    offerLines.push(`${t.caseId} t${proactiveAt[0] + 1}: ${tail(t.turns[proactiveAt[0]].assistantText, 100)}`);
  }
  if (userInitAt.length > 0) {
    userInitiatedConvs++;
    for (const i of userInitAt) {
      userInitiatedTurns++;
      userInitLines.push(`${t.caseId} t${i + 1} 유저: ${t.turns[i].userText.replace(/\s+/g, " ").slice(0, 60)} / 별콩이: ${tail(t.turns[i].assistantText, 100)}`);
    }
  }
  if (proactiveAt.length > 1) {
    multi++;
    violationLines.push(`[대화당 2회+ 먼저 꺼낸 제안] ${t.caseId} 제안 턴 ${proactiveAt.map((i) => `t${i + 1}`).join("·")}`);
  }
  if (sensitiveAt >= 0 && offerAt.some((i) => i >= sensitiveAt)) {
    crisisViolations++;
    violationLines.push(`[위기 헤더 뒤 제안] ${t.caseId} 민감 헤더 t${sensitiveAt + 1} · 제안 ${offerAt.map((i) => `t${i + 1}`).join("·")}`);
  }
  for (const i of offerAt) {
    const text = visible(t.turns[i].assistantText);
    const kind = userInitAt.includes(i) ? "유저 요청" : "먼저";
    const price = PRICE_RE.exec(text);
    if (price) {
      priceViolations++;
      violationLines.push(`[가격 언급 "${price[0]}" · ${kind}] ${t.caseId} t${i + 1}: ${tail(text)}`);
    }
    if (endsWithQuestion(text)) {
      questionEndingOffers++;
      violationLines.push(`[물음표로 끝남 · ${kind}] ${t.caseId} t${i + 1}: ${tail(text)}`);
    }
    if (!OFFER_PHRASE_RE.test(text)) {
      offerWithoutPhrase++;
      formatLines.push(`[제안 문구 없음] ${t.caseId} t${i + 1}: ${tail(text)}`);
    }
    if (!MARKER_LAST_LINE_RE.test(t.turns[i].assistantText)) {
      offerNotLastLine++;
      formatLines.push(`[마커가 끝 단독 줄 아님] ${t.caseId} t${i + 1}: ${tail(text)}`);
    }
  }

  // '한 장 더' 후보 턴 근사(첫 풀이 이후 · 자유 구간 · 유저가 묻는 중 · 아직 제안 전) + 열어 둔 턴 연속 구간 길이 + 작별 문구
  let offeredBefore = false;
  let isCandidateConv = false;
  let run = 0;
  for (const [i, x] of t.turns.entries()) {
    if (i >= 1 && !offeredBefore && x.headers["x-wrap-mode"] === "free" && classifyUserTurn(x.userText).asking) isCandidateConv = true;
    if (isOffer(x)) offeredBefore = true;

    if (isKeptOpen(x)) {
      keepOpenTurns++;
      run++;
      const text = visible(x.assistantText);
      const hit = FAREWELLS.find(([, re]) => re.test(text));
      if (hit) {
        farewellOnKeepOpen++;
        farewellLines.push(`${t.caseId} t${i + 1} [${hit[0]}] 유저: ${x.userText.replace(/\s+/g, " ").slice(0, 60)} / 별콩이: ${tail(text)}`);
      }
    } else if (run > 0) {
      keepOpenStreaks[run] = (keepOpenStreaks[run] ?? 0) + 1;
      run = 0;
    }
  }
  if (run > 0) keepOpenStreaks[run] = (keepOpenStreaks[run] ?? 0) + 1;
  if (isCandidateConv) candidateConvs++;
}

const section = (title: string, lines: string[]) => {
  console.log(`\n== ${title} (${lines.length}) ==`);
  for (const l of lines) console.log(`  ${l}`);
};
section("먼저 꺼낸 제안이 있는 대화 (첫 제안 턴)", offerLines);
section("위반", violationLines);
section("INFO 유저 요청 제안 (분류 확인용 — 비율·multi 에서 제외)", userInitLines);
section("INFO 제안 형식 이탈", formatLines);
section("INFO 열어 둔 턴 + 작별 문구", farewellLines);
section("INFO 분모에서 뺀 대화", excludedLines);

const pct = pctOf(offered, convs);
console.log(
  `\n${JSON.stringify({
    convs,
    offered,
    pct,
    offeredAny,
    pctAny: pctOf(offeredAny, convs),
    userInitiatedTurns,
    userInitiatedConvs,
    convsNonAbandon,
    offeredNonAbandon,
    pctNonAbandon: pctOf(offeredNonAbandon, convsNonAbandon),
    multi,
    priceViolations,
    crisisViolations,
    questionEndingOffers,
    offerWithoutPhrase,
    offerNotLastLine,
    farewellOnKeepOpen,
    keepOpenTurns,
    keepOpenStreaks,
    candidateConvs,
    excluded: excludedLines.length,
    bySpread: Object.fromEntries(
      Object.entries(bySpread).map(([k, v]) => [k, { ...v, pct: pctOf(v.offered, v.convs), pctAny: pctOf(v.offeredAny, v.convs) }]),
    ),
  })}`,
);
console.log(pct >= 20 && pct <= 35 ? "BAND OK (20~35%)" : "BAND OUT (20~35%)");
if (multi > 0 || priceViolations > 0 || crisisViolations > 0 || questionEndingOffers > 0) process.exitCode = 1;
