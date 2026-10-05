// scripts/smoke-inchat-offer.ts — 2026-10-04 타로톡 인챗 결제 제안·대화 길이 런타임 스모크 (dev 서버 대상 · 수동 · 대본형).
// spec: docs/superpowers/specs/2026-10-04-타로톡-인챗결제-대화길이-design.md §3-1 ~ §3-5
//
// 투카드(love) 리딩 하나를 실제 API 로 끝까지 몰아 아래를 확인한다. 결정적인 것만 PASS/FAIL, 모델 판단에 달린 것은 INFO.
//   T2~T11    자연 마무리선(9번째 · 누적 3,640자 도달 시)에서 유저가 묻는 중이면 [END] 없음(keep-open §3-3). 강제 종료선 전 조기 [END] 는 FAIL + 중단
//   T12       강제 종료선 — [END] · X-End-Reason=abs_cap · X-Reopen 에 extend·clarifier (§3-4)
//   GET       /api/readings/:id → reopen = {extend:true, clarifier:true}
//   extend    구매 200 · ★ 마지막 별콩이 메시지 [END] 제거(선점 CAS `.like("content","%[END]%")` 가 실 PostgREST 에서 먹는가) · 별 −10 · star_transactions(spend/extend)
//   ③         연장 뒤 평서문 3턴(T13~15) — [END] 없음 · X-Wrap-Mode ≠ hardcap (자연 마무리선 = 강제 종료선 정렬, 사용자 결정 2026-10-04 ③)
//   T16       다시 강제 종료선 — [END] · abs_cap · X-Reopen = clarifier (extend 소진)
//   GET       reopen = {extend:false, clarifier:true}
//   clarifier 구매 200 · [END] 제거 · drawn_cards 3 · 별 −10
//   ⑦ T17     구매 직후 클라가 보내는 synthetic 메시지 턴 — [END] 없음 (abs−1 이어도 열어 두기)
//   T18       abs_cap 재종료 · X-Reopen = clarifier (보조 카드 최대 2회 중 1회 더)
//   동시      clarifier 2건 동시 구매 — 200 정확히 1건 · 진 쪽 409 purchase_in_progress | 400 clarifier_limit_reached · 별 −10 · [END] 없음 · drawn_cards 4
//
// 실행 — dev 서버(localhost:3000)가 이 워킹트리로 떠 있어야 한다(서버측 코드·페르소나를 고쳤으면 재시작 후):
//   node --import tsx --env-file=.env.local scripts/smoke-inchat-offer.ts
//
// --fixture — 브라우저 검수용 리딩 2건만 만든다(구매 없음 · 인자 없는 기본 모드는 위 그대로). 만든 리딩의 id·URL 을 찍는다:
//   A 종료 후 제안   기본 모드와 같은 T1~T12 로 강제 종료선까지 몰고 멈춘다 — T12 [END]·X-End-Reason=abs_cap·X-Reopen="extend,clarifier" · GET reopen={extend:true, clarifier:true}. 종료된 채로 둔다
//                    → 브라우저: '결과 보기 →' 아래 구분선 '아직 할 얘기가 남았다면' + 작은 칩 '4턴 더 ⭐10'·'카드 한 장 더 ⭐10'
//   B 첫 답 화면     다른 고민 문구로 T1 만(같은 문구면 60초 중복 생성 방어가 A 를 돌려준다) — 200 · [END] 없음
//                    → 브라우저: 입력창 아래 '✦ 궁금한 건 이어서 물어봐도 돼' + '마무리하고 결과 보기 ›' 한 줄(대화 내내 같은 줄, 금색 버튼 없음)
//   node --import tsx --env-file=.env.local scripts/smoke-inchat-offer.ts --fixture      (LLM 13회 · 소요 약 1분 20초, 2026-10-04 실측 82초)
//
// --race — 다른 탭 경합(spec §7): 강제 종료선 턴(T12)이 스트리밍되는 도중 다른 탭에서 '4턴 더'를 산다. 새 투카드 리딩 하나로:
//   T1~T11   기본 모드와 같은 대본(구매 없음)
//   T12      응답 헤더가 오면(= 서버가 extra_turns 0 을 읽어 이 턴을 강제 종료 턴으로 정하고 모델 호출을 시작한 뒤) extend 구매 — 200 · reopened=false · 별 −10
//            (전제 단언: 스트림에 [END] · X-End-Reason=abs_cap — 닫는 턴이 아니면 ★ 가 수정과 무관하게 통과하므로 중단)
//            ★ T12 저장본에 [END] 없음 — 스트림 도중 산 턴이 닫힌 채 남지 않는다(채팅 라우트가 저장 직전 구매 횟수를 다시 읽는다)
//   GET      reopen = {extend:false, clarifier:false} (닫히지 않았으니 재개 대상 아님)
//   T13      새로고침과 같게 [END] 를 지운 이력으로 — 200 · [END] 없음(산 턴으로 이어진다)
//   T14      '마무리하고 결과 보기'(forceEnd) 스트리밍 도중 '한 장 더' 구매 — 전제(스트림에 [END]) 뒤 ★ 저장본 [END] 없음(마무리 버튼 턴도 산 턴이 우선, 사용자 결정 2026-10-05)
//   node --import tsx --env-file=.env.local scripts/smoke-inchat-offer.ts --race      (LLM 14회 · 구매 2회)
//
// ⚠️ 로컬 .env.local 의 dev Supabase 를 쓰고 LLM 을 약 18회 호출한다(원가 발생 · 소요 약 2분, 2026-10-04 실측 108초). 리딩은 지우지 않는다(브라우저로 열어 보려고) — 테스트 유저(QA봇) 소유.
// ⚠️ 같은 리딩을 60초 안에 다시 만들면 중복 생성 방어가 기존 리딩을 돌려준다 — 실행 사이에 1분 이상 띄울 것.
// ⚠️ 모델 응답이 누적 3,640자에 못 미치면 9번째가 자연 마무리선(hardcap)이 아니라 keep-open 경로가 실행되지 않는다 → INFO 로 남는다. 질문을 더 자세히 청하게 고쳐 다시 돌릴 것.
import { config } from "../qa/config.ts";
import { ensureTestUser, topUpStars, getBalance } from "../qa/seed.ts";
import { postJson, postChat, type ChatResponse } from "../qa/client.ts";
import { getServiceSupabase } from "../lib/supabase.ts";
import { QA_SEEDED_CARD_IDS } from "../qa/evaluate/assertions.ts";
import { SPREAD_INFO } from "../lib/tarot/spreads.ts";
import { WRAP_THRESHOLDS } from "../lib/tarot/constants.ts";
import { effectiveAbsTurnCap, stripEndFromLastAssistant, stripTrailingEnd } from "../lib/tarot/reopen.ts";
import { getCard } from "../lib/tarot/cards.ts";
import { clarifierSyntheticMessage } from "../lib/tarot/clarifier-message.ts";
import { EXTEND_COST, EXTEND_TURNS, CLARIFIER_COST, CLARIFIER_MAX } from "../lib/upsell.ts";

// ── 대본 상수 (아래 '대본 전제' 단언이 코드 상수와 어긋나면 중단한다 — 턴 번호가 틀어지므로) ──
const SPREAD = "two_card" as const;
const CONCERN = "헤어진 사람한테 다시 연락이 올까? 계속 생각나";
const EMOTION = "걔 속마음이 궁금해";
const CONCERN_B = "걔가 요즘 답장이 부쩍 늦어졌어. 나한테 마음이 식은 건지 궁금해"; // --fixture B 전용 — CONCERN 과 달라야 60초 중복 생성 방어가 A 를 돌려주지 않는다
const CONCERN_RACE = "썸 타던 사람이 요즘 연락이 뜸해졌어. 다시 가까워질 수 있을까?"; // --race 전용 — 다른 모드 문구와 달라야 60초 중복 생성 방어에 안 걸린다
const ABS = 12; // 기본 강제 종료선
const ABS_EXTENDED = ABS + EXTEND_TURNS; // 연장 뒤 강제 종료선(16)
const NATURAL_TURN = 9; // 자연 마무리선 턴
const NATURAL_CHARS = 3640; // 자연 마무리선 글자 임계
const PURCHASES = 4; // 시드 잔액 여유 계산용 — extend 1 + clarifier 1 + 동시 clarifier 2
const CHAT_PATH = "/api/consultations/tarot/chat";
const CLARIFIER_PATH = "/api/consultations/tarot/clarifier";

// T2~T12 질문 — 전부 물음표가 있어 classifyUserTurn().asking=true. 응답이 길어지도록 '자세히'를 청한다(누적 3,640자 도달용).
// 위기 감지(lib/sensitive.ts)에 걸릴 말(우울·외로움·포기류)은 일부러 뺐다 — 걸리면 has_sensitive 로 재개 상품이 막혀 시나리오가 무효가 된다.
const QUESTIONS: string[] = [
  /* T2 */ "그 사람은 지금 나를 어떻게 생각하고 있을까? 카드가 보여주는 마음을 자세히 풀어서 알려줄래?",
  /* T3 */ "그럼 내가 먼저 연락해 보는 게 좋을까? 연락하면 어떤 흐름이 생길지 자세히 알려줄래?",
  /* T4 */ "연락한다면 첫마디는 어떻게 꺼내는 게 좋을까? 분위기에 맞는 방법을 구체적으로 알려줄래?",
  /* T5 */ "답장이 늦게 오거나 안 오면 그걸 어떻게 받아들이면 좋을까? 카드 기준으로 차근차근 설명해줄래?",
  /* T6 */ "그 사람 주변에 지금 다른 인연이 있을 가능성도 카드에 보여? 보이는 대로 자세히 말해줄래?",
  /* T7 */ "시기로 보면 언제쯤 분위기가 달라질 수 있을까? 흐름 위주로 자세히 풀어줄래?",
  /* T8 */ "기다리기만 하는 게 맞는지 행동해 보는 게 맞는지 헷갈려. 둘 중에 뭐가 나은지 카드로 봐줄래?",
  /* T9 */ "만약 다시 만나게 되면 예전이랑 같을까, 달라질까? 두 카드가 말해주는 흐름으로 자세히 알려줄래?",
  /* T10 */ "그 사람이 변할 가능성은 얼마나 있을까? 카드가 말해주는 점을 하나씩 짚어줄래?",
  /* T11 */ "지금 내가 현실적으로 해볼 수 있는 행동은 뭐가 있을까? 오늘부터 할 수 있는 걸로 알려줄래?",
  /* T12 */ "그럼 이 두 카드가 나한테 건네는 가장 중요한 한마디는 뭘까?",
];
// 연장 뒤 T13~T15 — 질문도 마무리어도 아닌 평서문(결정 ③: 산 턴은 자연 마무리선이 아니라 수렴 말투로 이어진다)
const STATEMENTS = ["응 계속 얘기하자", "나 사실 아직 걔가 좋아", "그냥 좀 더 얘기하고 싶었어"];
const Q_T16 = "그래도 좀 더 얘기하고 싶어. 내 마음은 지금 재회 쪽에 가까운지 카드로 봐줄 수 있을까?";
const Q_T18 = "카드 한 장 더 보니까 흐름이 더 또렷해진 것 같아. 그래서 내가 이번 주에 뭘 해보면 좋을까?";

// ── 출력 · 판정 ──
let passed = 0;
let failed = 0;
let infos = 0;

function check(label: string, cond: boolean, extra?: unknown): boolean {
  console.log(`[${cond ? "PASS" : "FAIL"}] ${label}${extra === undefined ? "" : `  →  ${JSON.stringify(extra)}`}`);
  if (cond) passed++;
  else failed++;
  return cond;
}
function info(msg: string) {
  infos++;
  console.log(`[INFO] ${msg}`);
}

/** 이후 단계가 의미 없는 실패 — FAIL 로 세고(이미 위에서 센 check 면 alreadyCounted) 중단한다. 요약은 main 의 finally 가 찍는다 */
class Bail extends Error {}
function bail(msg: string, alreadyCounted = false): never {
  if (!alreadyCounted) failed++;
  console.log(`[FAIL] ${msg}  — 이후 단계 중단`);
  throw new Bail(msg);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── 상태 ──
type Msg = { role: "user" | "assistant"; content: string };
const S = {
  readingId: "",
  history: [] as Msg[],
  turn: 0, // 지금까지 받은 별콩이 답 수
  trail: [] as string[], // 턴별 wrap 흐름 — 요약용
  balStart: 0,
  balAfterCreate: 0,
};

const db = getServiceSupabase();

// 클라(lib/tarot/bubbles.ts END_MARKER_REGEX)와 같은 눈 — 대소문자 무시·위치 무관
const hasEnd = (s: string): boolean => /\[END\]/i.test(s);
// 서버 chat 라우트의 누적 글자 계산과 같은 식(마커 제외)
const MARKER_RE = /\[CARD:\d+\]|\[END\]/g;
/** 저장본이 재개 가능한 모양인가 — [END] 가 대소문자 무시로 정확히 하나, 그것도 맨 끝(finalizeAssistantText 가 보장하는 모양) */
const endShapeOk = (s: string): boolean => (s.match(/\[END\]/gi) ?? []).length === 1 && /\[END\]\s*$/.test(s);
const headerTokens = (v: string | undefined): string[] =>
  (v ?? "").split(",").map((t) => t.trim()).filter(Boolean);

// ── DB · API 헬퍼 (실패는 plain Error — 요약 단계에서도 쓰므로 bail 로 세지 않는다) ──
async function assistantStats(): Promise<{ count: number; chars: number; last: string }> {
  const { data, error } = await db
    .from("messages")
    .select("content")
    .eq("reading_id", S.readingId)
    .eq("role", "assistant")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`messages 조회 실패: ${error.message}`);
  const rows = (data ?? []) as { content: string }[];
  return {
    count: rows.length,
    chars: rows.reduce((a, m) => a + m.content.replace(MARKER_RE, "").length, 0),
    last: rows.length > 0 ? rows[rows.length - 1].content : "",
  };
}

interface ReadingRow {
  drawn_cards: { position: number; label: string; card_id: number; direction: string }[];
  extra_turns: number | null;
  clarifier_count: number | null;
  has_sensitive: boolean | null;
}
async function readingRow(): Promise<ReadingRow> {
  const { data, error } = await db
    .from("readings")
    .select("drawn_cards, extra_turns, clarifier_count, has_sensitive")
    .eq("id", S.readingId)
    .single();
  if (error || !data) throw new Error(`readings 조회 실패: ${error?.message ?? "no row"}`);
  return data as ReadingRow;
}

async function getReading(): Promise<{ status: number; reopen?: { extend: boolean; clarifier: boolean } }> {
  const res = await fetch(`${config.BASE_URL}/api/readings/${S.readingId}`, {
    headers: { Cookie: `byeolkong_user_id=${config.TEST_USER_ID}` }, // qa/client.ts cookieHeader() 와 같은 세션 쿠키
  });
  const json = (await res.json().catch(() => ({}))) as { reopen?: { extend: boolean; clarifier: boolean } };
  return { status: res.status, reopen: json.reopen };
}

/** chat 한 번 — 429 는 61초 기다려 재시도, 연결 오류·5xx 는 최대 3회. 별은 리딩 생성 때 이미 냈고 메시지는 스트림이 끝나야 저장되므로 재시도는 안전하다(턴 수 어긋남은 runTurn 의 DB 단언이 막는다) */
async function chat(turn: number): Promise<ChatResponse> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res: ChatResponse | null = null;
    try {
      res = await postChat(CHAT_PATH, { readingId: S.readingId, messages: S.history });
    } catch (e) {
      info(`T${turn} 시도 ${attempt}/3 — 연결 오류: ${String(e).slice(0, 120)}`);
    }
    if (res?.status === 429) {
      info(`T${turn} 429(rate limit) — 61초 대기 후 재시도`);
      await sleep(61_000);
      continue;
    }
    if (res && res.status === 200 && res.text.trim()) return res;
    if (res && res.status !== 200 && res.status < 500) return res; // 4xx — 재시도해도 같다
    if (res) info(`T${turn} 시도 ${attempt}/3 — HTTP ${res.status} ${res.text.slice(0, 120).replace(/\s+/g, " ")}`);
    await sleep(2_000);
  }
  return bail(`T${turn} chat 이 3회 시도 후에도 성공하지 못함`);
}

interface TurnResult {
  turn: number;
  res: ChatResponse;
  wrap: string;
  end: boolean;
  /** 이 턴 직후 DB 누적 별콩이 글자(마커 제외) */
  cum: number;
}

/** 유저 말 하나를 보내 별콩이 답을 받는다 — 매 턴 DB 별콩이 답 수 == 턴 번호를 단언해(어긋나면 이후 판정이 전부 무효) 중단한다 */
async function runTurn(userText: string): Promise<TurnResult> {
  const turn = S.turn + 1;
  S.history.push({ role: "user", content: userText });
  const res = await chat(turn);
  if (res.status !== 200) bail(`T${turn} chat HTTP ${res.status}: ${res.text.slice(0, 200)}`);
  S.history.push({ role: "assistant", content: res.text });
  S.turn = turn;

  const st = await assistantStats();
  if (st.count !== turn) bail(`T${turn} DB 별콩이 답 ${st.count}개 (기대 ${turn}) — 턴 수가 어긋나 이후 판정이 무효`);

  const wrap = res.headers["x-wrap-mode"] ?? "-";
  const end = hasEnd(res.text);
  S.trail.push(`${turn}:${wrap}${end ? "+END" : ""}`);
  const marks = [
    end ? "END" : "",
    /\[RECO:tarot:clarifier\]/i.test(res.text) ? "RECO:clarifier" : "",
    /\[RECO:extend\]/i.test(res.text) ? "RECO:extend" : "",
  ].filter(Boolean);
  const hdr = [
    res.headers["x-end-reason"] ? `end-reason=${res.headers["x-end-reason"]}` : "",
    res.headers["x-reopen"] !== undefined ? `reopen="${res.headers["x-reopen"]}"` : "",
  ].filter(Boolean);
  const tail = res.text.replace(/\s+/g, " ").trim().slice(-50);
  info(
    `T${turn} wrap=${wrap} 답 ${res.text.length}자 누적 ${st.chars}자 마커=${marks.join("+") || "-"}${hdr.length ? ` ${hdr.join(" ")}` : ""}  …${tail}`,
  );
  return { turn, res, wrap, end, cum: st.chars };
}

/** 구매 직후 클라가 하는 것과 같게 로컬 히스토리의 마지막 별콩이 메시지에서 [END] 를 지운다(lib/tarot/reopen.ts stripEndFromLastAssistant) */
function reopenLocally() {
  S.history = stripEndFromLastAssistant(S.history);
}

interface PurchaseJson {
  extraTurns?: number;
  clarifierCount?: number;
  drawnCards?: unknown[];
  reopened?: boolean;
  error?: string;
}

// ── 본 시나리오 ──
async function scenario() {
  console.log("══ 타로톡 인챗 결제 제안·대화 길이 — dev 스모크 ══");
  const base = new URL(config.BASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
    bail(`BASE_URL=${config.BASE_URL} — 로컬 dev 서버(localhost) 전용 스모크다`);
  }
  let sbHost = "(env 없음)";
  try {
    sbHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    /* 표시용일 뿐 */
  }
  console.log(`BASE_URL=${config.BASE_URL}  test-user=${config.TEST_USER_ID}  supabase=${sbHost}`);

  // [대본 전제] 코드 상수가 이 스크립트의 턴 번호와 같은가
  const th = WRAP_THRESHOLDS[SPREAD];
  const premise = {
    naturalTurn: th.hardCapTurn,
    naturalChars: th.hardCapChars,
    abs: th.absTurnCap,
    absAfterExtend: effectiveAbsTurnCap(SPREAD, EXTEND_TURNS, 0),
    absAfterExtendClar1: effectiveAbsTurnCap(SPREAD, EXTEND_TURNS, 1),
    absAfterExtendClar2: effectiveAbsTurnCap(SPREAD, EXTEND_TURNS, 2),
    extendCost: EXTEND_COST,
    clarifierCost: CLARIFIER_COST,
    clarifierMax: CLARIFIER_MAX,
  };
  const premiseOk =
    premise.naturalTurn === NATURAL_TURN &&
    premise.naturalChars === NATURAL_CHARS &&
    premise.abs === ABS &&
    premise.absAfterExtend === ABS_EXTENDED &&
    premise.absAfterExtendClar1 === ABS_EXTENDED + 2 &&
    premise.absAfterExtendClar2 === ABS_EXTENDED + 4 &&
    premise.extendCost === 10 &&
    premise.clarifierCost === 10 &&
    premise.clarifierMax === 2;
  if (
    !check(
      "대본 전제 = 코드 상수 (투카드 자연 9번째·3,640자 / 강제 12 → 연장 16 → 보조1 18 → 보조2 20 / 구매 각 10별 / 보조 최대 2)",
      premiseOk,
      premise,
    )
  ) {
    bail("대본 전제가 코드 상수와 달라 턴 번호가 틀어진다 — 스크립트 갱신 필요", true);
  }

  // ── [1] 준비 ──
  console.log("\n── [1] 준비 ──");
  await ensureTestUser();
  await topUpStars(); // qa/seed.ts — star_balances.balance 를 config.SEED_BALANCE 로 고정한다(더하는 게 아니라 맞춤)
  S.balStart = await getBalance();
  const spreadCost = SPREAD_INFO[SPREAD].starCost;
  const need = spreadCost + PURCHASES * 10;
  check(`시드 잔액 충분 (투카드 ${spreadCost}별 + 구매 ${PURCHASES}회 × 10별 = ${need}별 이상)`, S.balStart >= need, { balance: S.balStart });

  // ── [2] 리딩 생성 + 첫 풀이 ──
  console.log("\n── [2] 투카드 리딩 생성 + 첫 풀이(T1) ──");
  const drawnCards = [0, 1].map((i) => ({
    position: i,
    label: `pos${i}`,
    card_id: QA_SEEDED_CARD_IDS[i],
    direction: "upright" as const,
  }));
  const created = await postJson<{ id?: string; duplicate?: boolean; error?: string }>("/api/consultations/tarot", {
    spreadType: SPREAD,
    spreadCategory: "love",
    emotion: EMOTION,
    concern: CONCERN,
    drawnCards,
  });
  if (!check("투카드(love) 리딩 생성 200", created.status === 200 && !!created.json.id, created)) {
    bail("리딩을 만들지 못했다", true);
  }
  if (created.json.duplicate === true) {
    bail("60초 안에 같은 리딩을 만든 적이 있어 기존 리딩이 재사용됐다(중복 생성 방어) — 1분 뒤 다시 실행");
  }
  S.readingId = created.json.id!;
  S.balAfterCreate = await getBalance();
  info(`reading id = ${S.readingId} · 잔액 ${S.balStart} → ${S.balAfterCreate} (리딩 −${S.balStart - S.balAfterCreate})`);

  const t1 = await runTurn(CONCERN);
  if (!check("T1 첫 풀이 — [END] 없음", !t1.end, { wrap: t1.wrap })) bail("T1 에서 조기 [END]", true);

  // ── [3] T2 ~ T12 ──
  console.log(`\n── [3] T2~T${ABS} — 자연 마무리선(T${NATURAL_TURN}) keep-open · 강제 종료선(T${ABS}) ──`);
  let keepOpenRan = false;
  let r12!: TurnResult;
  for (let turn = 2; turn <= ABS; turn++) {
    const r = await runTurn(QUESTIONS[turn - 2]);
    if (turn === ABS) {
      r12 = r;
      break;
    }
    if (r.wrap === "hardcap") {
      keepOpenRan = true;
      const ok = check(`T${turn} 자연 마무리선(hardcap) + 유저가 묻는 중 → [END] 없음 (keep-open)`, !r.end, { wrap: r.wrap, cum: r.cum });
      if (!ok) bail(`T${turn} keep-open 이 [END] 를 못 막았다`, true);
    } else if (turn === NATURAL_TURN) {
      info(`T${NATURAL_TURN} wrap=${r.wrap} (hardcap 아님) — 누적 ${r.cum}자 < ${NATURAL_CHARS}자라 자연 마무리선 미도달, keep-open 은 사소하게 만족`);
    }
    if (r.end) bail(`T${turn} 에서 조기 [END] (wrap=${r.wrap}, 강제 종료선 ${ABS} 전)`);
  }
  if (!keepOpenRan) {
    info(`T${NATURAL_TURN}~T${ABS - 1} 어디서도 hardcap 이 안 떠 keep-open 경로가 실행되지 않았다(누적 글자 부족) — 질문을 더 자세히 청하게 바꿔 재실행할 것`);
  }

  console.log(`\n── T${ABS} 강제 종료선 ──`);
  const row12 = await readingRow();
  check("has_sensitive = false (위기 오탐 없음 — 있으면 재개 상품이 막혀 시나리오 무효)", row12.has_sensitive === false, { has_sensitive: row12.has_sensitive });
  const end12 = check(`T${ABS} [END] 있음`, r12.end, { wrap: r12.wrap });
  check(`T${ABS} X-End-Reason = abs_cap`, r12.res.headers["x-end-reason"] === "abs_cap", r12.res.headers["x-end-reason"]);
  const tok12 = headerTokens(r12.res.headers["x-reopen"]);
  check(`T${ABS} X-Reopen 에 extend·clarifier 둘 다`, tok12.includes("extend") && tok12.includes("clarifier"), r12.res.headers["x-reopen"]);
  const st12 = await assistantStats();
  check(`T${ABS} 저장본 — [END] 정확히 하나·맨 끝 (재개 가능한 모양)`, endShapeOk(st12.last), { tail: st12.last.slice(-30) });
  if (!end12) bail(`T${ABS} 에 [END] 가 없어 재개 시나리오를 이어갈 수 없다`, true);

  // ── [4] GET reopen ──
  console.log("\n── [4] GET /api/readings/:id ──");
  const g1 = await getReading();
  check("reopen = {extend:true, clarifier:true}", g1.status === 200 && g1.reopen?.extend === true && g1.reopen?.clarifier === true, { status: g1.status, reopen: g1.reopen });

  // ── [5] extend 구매 ──
  console.log(`\n── [5] extend 구매 (${EXTEND_COST}별) ──`);
  const preExt = await assistantStats();
  const balBeforeExt = await getBalance();
  const ext = await postJson<PurchaseJson>(`/api/readings/${S.readingId}/extend`, {});
  const extOk = check(`extend 구매 200 · reopened=true · extraTurns=${EXTEND_TURNS}`, ext.status === 200 && ext.json.reopened === true && ext.json.extraTurns === EXTEND_TURNS, ext);
  const postExt = await assistantStats();
  const extCasOk = check(
    "★ DB 마지막 별콩이 메시지에서 [END] 제거 — 선점 CAS(.like) 가 실 PostgREST 에서 동작",
    !hasEnd(postExt.last),
    { tail: postExt.last.slice(-30) },
  );
  check("본문 보존 — 끝 [END]·공백만 제거(stripTrailingEnd 와 동일)", postExt.last === stripTrailingEnd(preExt.last), { before: preExt.last.length, after: postExt.last.length });
  if (!extOk || !extCasOk) {
    console.log("!!! 재개 선점 CAS 실패 — 이게 깨지면 모든 재개 구매(extend·clarifier)가 400/409 로 죽거나 구매는 됐는데 대화가 닫힌 채로 남는다 !!!");
  }
  const balAfterExt = await getBalance();
  check(`별 −${EXTEND_COST} (extend)`, balBeforeExt - balAfterExt === EXTEND_COST, { before: balBeforeExt, after: balAfterExt });
  const { data: extTx } = await db
    .from("star_transactions")
    .select("type, amount, source, reading_id")
    .eq("user_id", config.TEST_USER_ID)
    .eq("reading_id", S.readingId)
    .eq("source", "extend");
  const extTxRows = (extTx ?? []) as { type: string; amount: number; source: string; reading_id: string }[];
  check(
    "star_transactions — type=spend · source=extend · 이 reading_id · 1행",
    extTxRows.length === 1 && extTxRows[0].type === "spend" && extTxRows[0].amount === EXTEND_COST,
    extTxRows,
  );
  if (!extOk || !extCasOk) bail("extend 구매가 대화를 다시 열지 못했다", true);
  reopenLocally();

  // ── [6] 결정 ③ ──
  console.log(`\n── [6] 결정 ③ — 연장 뒤 평서문 3턴 (T${ABS + 1}~T${ABS_EXTENDED - 1}) ──`);
  for (const s of STATEMENTS) {
    const r = await runTurn(s);
    const ok = check(`T${r.turn} (연장 뒤·평서문) — [END] 없음`, !r.end, { wrap: r.wrap });
    check(`T${r.turn} X-Wrap-Mode ≠ hardcap`, r.wrap !== "hardcap", { wrap: r.wrap });
    if (!ok) bail(`T${r.turn} 에서 조기 [END] — 연장으로 산 턴이 강제 종료선(${ABS_EXTENDED}) 전에 닫혔다`, true);
  }

  // ── [7] T16 ──
  console.log(`\n── [7] T${ABS_EXTENDED} — 연장 뒤 강제 종료선 ──`);
  const r16 = await runTurn(Q_T16);
  check(`T${ABS_EXTENDED} 가 맞는 턴 번호`, r16.turn === ABS_EXTENDED, { turn: r16.turn });
  const end16 = check(`T${ABS_EXTENDED} [END] 있음`, r16.end, { wrap: r16.wrap });
  check(`T${ABS_EXTENDED} X-End-Reason = abs_cap`, r16.res.headers["x-end-reason"] === "abs_cap", r16.res.headers["x-end-reason"]);
  check(`T${ABS_EXTENDED} X-Reopen = clarifier (extend 소진이라 정확히 이것만)`, r16.res.headers["x-reopen"] === "clarifier", r16.res.headers["x-reopen"]);
  const st16 = await assistantStats();
  check(`T${ABS_EXTENDED} 저장본 — [END] 정확히 하나·맨 끝`, endShapeOk(st16.last), { tail: st16.last.slice(-30) });
  if (!end16) bail(`T${ABS_EXTENDED} 에 [END] 가 없어 보조 카드 재개를 이어갈 수 없다`, true);

  // ── [8] GET reopen ──
  console.log("\n── [8] GET /api/readings/:id ──");
  const g2 = await getReading();
  check("reopen = {extend:false, clarifier:true}", g2.status === 200 && g2.reopen?.extend === false && g2.reopen?.clarifier === true, { status: g2.status, reopen: g2.reopen });

  // ── [9] clarifier 구매 ──
  console.log(`\n── [9] clarifier 구매 (${CLARIFIER_COST}별) ──`);
  const row9pre = await readingRow();
  const drawnIds = row9pre.drawn_cards.map((c) => c.card_id);
  const spare = QA_SEEDED_CARD_IDS.filter((id) => !drawnIds.includes(id)); // 안 뽑은 시드 카드
  const [card9, cardA, cardB] = spare;
  if (card9 === undefined || cardA === undefined || cardB === undefined) {
    bail(`시드 덱에 안 뽑은 카드가 3장 미만이다 (뽑힘 ${drawnIds.join(",")})`);
  }
  const preCl = await assistantStats();
  const balBeforeCl = await getBalance();
  const cl = await postJson<PurchaseJson>(CLARIFIER_PATH, { readingId: S.readingId, card: { card_id: card9, direction: "upright" } });
  const clOk = check("clarifier 구매 200 · reopened=true · clarifierCount=1", cl.status === 200 && cl.json.reopened === true && cl.json.clarifierCount === 1, { status: cl.status, json: { ...cl.json, drawnCards: undefined }, card: card9 });
  const postCl = await assistantStats();
  const clCasOk = check("DB 마지막 별콩이 메시지 [END] 제거", !hasEnd(postCl.last), { tail: postCl.last.slice(-30) });
  check("본문 보존 — 끝 [END]·공백만 제거", postCl.last === stripTrailingEnd(preCl.last), { before: preCl.last.length, after: postCl.last.length });
  const row9 = await readingRow();
  check("drawn_cards 길이 3 · 새 카드가 맨 끝", row9.drawn_cards.length === 3 && row9.drawn_cards[2]?.card_id === card9, { ids: row9.drawn_cards.map((c) => c.card_id) });
  const balAfterCl = await getBalance();
  check(`별 −${CLARIFIER_COST} (clarifier)`, balBeforeCl - balAfterCl === CLARIFIER_COST, { before: balBeforeCl, after: balAfterCl });
  if (!clOk || !clCasOk) bail("clarifier 구매가 대화를 다시 열지 못했다", true);
  reopenLocally();

  // ── [10] 결정 ⑦ — T17 ──
  console.log(`\n── [10] 결정 ⑦ — 보조 카드 구매 직후 synthetic 턴 (T${ABS_EXTENDED + 1}) ──`);
  const card = getCard(card9);
  const synthetic = clarifierSyntheticMessage(card ? `'${card.name_kr}' (정방향)` : "카드 한 장"); // handleClarifierDrawn 과 같은 문구
  const r17 = await runTurn(synthetic);
  const ok17 = check(`T${r17.turn} (synthetic 메시지 · abs−1) — [END] 없음 (열어 두기 ⑦)`, !r17.end, { wrap: r17.wrap, user: synthetic });
  if (!ok17) bail(`T${r17.turn} 에서 [END] — 재개 직후 카드 풀이 턴이 닫혔다`, true);

  // ── [11] T18 ──
  console.log(`\n── [11] T${ABS_EXTENDED + 2} — 보조 카드 1장 뒤 강제 종료선 ──`);
  const r18 = await runTurn(Q_T18);
  check(`T${ABS_EXTENDED + 2} 가 맞는 턴 번호`, r18.turn === ABS_EXTENDED + 2, { turn: r18.turn });
  const end18 = check(`T${r18.turn} [END] 있음`, r18.end, { wrap: r18.wrap });
  check(`T${r18.turn} X-End-Reason = abs_cap`, r18.res.headers["x-end-reason"] === "abs_cap", r18.res.headers["x-end-reason"]);
  check(`T${r18.turn} X-Reopen = clarifier (보조 카드 최대 ${CLARIFIER_MAX}회 중 1회 더)`, r18.res.headers["x-reopen"] === "clarifier", r18.res.headers["x-reopen"]);
  const st18 = await assistantStats();
  check(`T${r18.turn} 저장본 — [END] 정확히 하나·맨 끝`, endShapeOk(st18.last), { tail: st18.last.slice(-30) });
  if (!end18) bail(`T${r18.turn} 에 [END] 가 없어 동시 구매 시나리오를 이어갈 수 없다`, true);

  // ── [12] 동시 clarifier 2건 ──
  console.log("\n── [12] 동시 clarifier 구매 2건 (서로 다른 카드) ──");
  const balBeforeRace = await getBalance();
  const [a, b] = await Promise.all([
    postJson<PurchaseJson>(CLARIFIER_PATH, { readingId: S.readingId, card: { card_id: cardA, direction: "upright" } }),
    postJson<PurchaseJson>(CLARIFIER_PATH, { readingId: S.readingId, card: { card_id: cardB, direction: "upright" } }),
  ]);
  const winners = [a, b].filter((r) => r.status === 200);
  const loser = [a, b].find((r) => r.status !== 200);
  check("200 은 정확히 1건", winners.length === 1, { cardA: a.status, cardB: b.status });
  const loserOk =
    !!loser &&
    ((loser.status === 409 && loser.json.error === "purchase_in_progress") ||
      (loser.status === 400 && loser.json.error === "clarifier_limit_reached"));
  check("진 쪽 = 409 purchase_in_progress | 400 clarifier_limit_reached", loserOk, loser ? { status: loser.status, error: loser.json.error } : null);
  info(`진 쪽 응답 = ${loser ? `${loser.status} ${loser.json.error}` : "(없음)"}`);
  const balAfterRace = await getBalance();
  check(`별 −${CLARIFIER_COST} (정확히 1회 차감)`, balBeforeRace - balAfterRace === CLARIFIER_COST, { before: balBeforeRace, after: balAfterRace });
  const stRace = await assistantStats();
  check("DB 마지막 별콩이 메시지 [END] 없음", !hasEnd(stRace.last), { tail: stRace.last.slice(-30) });
  const rowRace = await readingRow();
  const idsRace = rowRace.drawn_cards.map((c) => c.card_id);
  const pickedAB = [cardA, cardB].filter((id) => idsRace.includes(id));
  check(
    "drawn_cards 길이 4 · 새 카드는 이긴 쪽 하나만 · clarifier_count 2",
    rowRace.drawn_cards.length === 4 && pickedAB.length === 1 && rowRace.clarifier_count === 2,
    { ids: idsRace, clarifier_count: rowRace.clarifier_count, wonCard: pickedAB[0] },
  );
}

async function summary() {
  console.log("\n══ 요약 ══");
  console.log(`reading id : ${S.readingId || "(리딩 생성 전 중단)"}`);
  if (!S.readingId) return;
  console.log(`브라우저   : ${config.BASE_URL}/tarot/reading?id=${S.readingId}   (쿠키 byeolkong_user_id=${config.TEST_USER_ID} 주입 필요)`);
  try {
    const st = await assistantStats();
    const row = await readingRow();
    const bal = await getBalance();
    console.log(
      `상태       : 별콩이 답 ${st.count}턴 · drawn_cards ${row.drawn_cards.length}장 · extra_turns ${row.extra_turns} · clarifier_count ${row.clarifier_count} · has_sensitive ${row.has_sensitive} · 마지막 메시지 [END] ${hasEnd(st.last) ? "있음(닫힘)" : "없음(열림)"}`,
    );
    console.log(`별 잔액    : 시작 ${S.balStart} → 리딩 후 ${S.balAfterCreate} → 종료 ${bal}  (구매 합계 −${S.balAfterCreate - bal})`);
  } catch (e) {
    console.log(`(상태 조회 실패: ${String(e).slice(0, 120)})`);
  }
  console.log(`wrap 흐름  : ${S.trail.join(" ")}`);
  console.log(`집계       : PASS ${passed} · FAIL ${failed} · INFO ${infos}`);
}

// ── --fixture 모드 — 브라우저 검수용 리딩 2건 (구매 없음 · extend/clarifier 라우트는 부르지 않는다) ──
interface Fixture {
  tag: "A" | "B";
  id: string;
  title: string;
  /** 브라우저에서 이 리딩을 열면 보여야 할 것 */
  expect: string;
  /** 만든 직후 DB 상태 한 줄 */
  state?: string;
}
const fixtures: Fixture[] = [];

/** 지금 S.readingId 리딩의 DB 상태 한 줄 — fixture 를 만든 직후 찍어 둔다(다음 fixture 로 넘어가면 S 가 바뀐다) */
async function describeState(): Promise<string> {
  const st = await assistantStats();
  const row = await readingRow();
  return `별콩이 답 ${st.count}턴 · drawn_cards ${row.drawn_cards.length}장 · extra_turns ${row.extra_turns} · clarifier_count ${row.clarifier_count} · has_sensitive ${row.has_sensitive} · 마지막 메시지 [END] ${hasEnd(st.last) ? "있음(닫힘)" : "없음(열림)"}`;
}

/** 로컬 dev 서버 전용 가드 + 접속 정보 한 줄 — fixture 모드용(기본 시나리오는 같은 코드를 인라인으로 가진다 — 기본 모드를 건드리지 않으려고 따로 둔다) */
function preflight(title: string) {
  console.log(title);
  const base = new URL(config.BASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
    bail(`BASE_URL=${config.BASE_URL} — 로컬 dev 서버(localhost) 전용 스모크다`);
  }
  let sbHost = "(env 없음)";
  try {
    sbHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    /* 표시용일 뿐 */
  }
  console.log(`BASE_URL=${config.BASE_URL}  test-user=${config.TEST_USER_ID}  supabase=${sbHost}`);
}

/** fixture 리딩 하나 생성 — S 를 비우고 새로 시작한다. 기본 시나리오 [2] 와 같은 생성 호출(고민 문구만 인자) */
async function createFixture(tag: Fixture["tag"], title: string, expect: string, concern: string) {
  S.readingId = "";
  S.history = [];
  S.turn = 0;
  S.trail = [];
  const drawnCards = [0, 1].map((i) => ({
    position: i,
    label: `pos${i}`,
    card_id: QA_SEEDED_CARD_IDS[i],
    direction: "upright" as const,
  }));
  const created = await postJson<{ id?: string; duplicate?: boolean; error?: string }>("/api/consultations/tarot", {
    spreadType: SPREAD,
    spreadCategory: "love",
    emotion: EMOTION,
    concern,
    drawnCards,
  });
  if (!check(`${tag} 투카드(love) 리딩 생성 200`, created.status === 200 && !!created.json.id, created)) {
    bail(`fixture ${tag} 리딩을 만들지 못했다`, true);
  }
  if (created.json.duplicate === true) {
    bail(`fixture ${tag}: 60초 안에 같은 리딩을 만든 적이 있어 기존 리딩이 재사용됐다(중복 생성 방어) — 1분 뒤 다시 실행`);
  }
  S.readingId = created.json.id!;
  fixtures.push({ tag, id: S.readingId, title, expect });
  info(`fixture ${tag} reading id = ${S.readingId}`);
}

async function fixtureScenario() {
  preflight("══ 타로톡 인챗 결제 제안 — 브라우저 검수용 fixture (구매 없음) ══");

  // [대본 전제] A 가 T12 에서 강제 종료되려면 투카드 강제 종료선이 12 여야 한다
  const abs = WRAP_THRESHOLDS[SPREAD].absTurnCap;
  if (!check(`대본 전제(fixture) = 코드 상수 (투카드 강제 종료선 ${ABS})`, abs === ABS, { abs })) {
    bail("투카드 강제 종료선이 바뀌어 T12 가 마지막 턴이 아니다 — 스크립트 갱신 필요", true);
  }

  console.log("\n── [준비] ──");
  await ensureTestUser();
  await topUpStars();
  info(`시드 잔액 ${await getBalance()}별`);

  // ── [A] 종료 후 제안 — 기본 모드 [2]~[3] 과 같은 대본으로 T12 까지 ──
  console.log(`\n── [A] 종료 후 제안 fixture — 투카드 T1~T${ABS} 에서 멈춤 ──`);
  await createFixture(
    "A",
    "종료 후 제안",
    "닫힌 대화 — '결과 보기 →' 아래 구분선 '아직 할 얘기가 남았다면' + 작은 칩 '4턴 더 ⭐10' · '카드 한 장 더 ⭐10'",
    CONCERN,
  );
  const a1 = await runTurn(CONCERN);
  if (!check("A T1 첫 풀이 — [END] 없음", !a1.end, { wrap: a1.wrap })) bail("A T1 에서 조기 [END]", true);
  let r12!: TurnResult;
  for (let turn = 2; turn <= ABS; turn++) {
    const r = await runTurn(QUESTIONS[turn - 2]);
    if (turn === ABS) {
      r12 = r;
      break;
    }
    if (r.end) bail(`A T${turn} 에서 조기 [END] (wrap=${r.wrap}, 강제 종료선 ${ABS} 전)`);
  }
  check(`A T${ABS} [END] 있음`, r12.end, { wrap: r12.wrap });
  check(`A T${ABS} X-End-Reason = abs_cap`, r12.res.headers["x-end-reason"] === "abs_cap", r12.res.headers["x-end-reason"]);
  check(`A T${ABS} X-Reopen = "extend,clarifier"`, r12.res.headers["x-reopen"] === "extend,clarifier", r12.res.headers["x-reopen"]);
  const gA = await getReading();
  check("A GET reopen = {extend:true, clarifier:true}", gA.status === 200 && gA.reopen?.extend === true && gA.reopen?.clarifier === true, { status: gA.status, reopen: gA.reopen });
  fixtures[0].state = await describeState();

  // ── [B] 첫 답 화면 — T1 만 ──
  console.log("\n── [B] 첫 답 화면 fixture — 투카드 T1 만 ──");
  await createFixture(
    "B",
    "첫 답 화면",
    "열린 대화(별콩이 답 1개) — 입력창 아래 '✦ 궁금한 건 이어서 물어봐도 돼' + '마무리하고 결과 보기 ›' 한 줄(금색 버튼 없음)",
    CONCERN_B,
  );
  const b1 = await runTurn(CONCERN_B);
  check("B T1 — HTTP 200 · [END] 없음", b1.res.status === 200 && !b1.end, { status: b1.res.status, wrap: b1.wrap });
  fixtures[1].state = await describeState();
}

async function fixtureSummary() {
  console.log("\n══ fixture 요약 (구매 없음) ══");
  if (fixtures.length === 0) console.log("(리딩 생성 전 중단)");
  for (const f of fixtures) {
    if (!f.state && f.id === S.readingId) f.state = await describeState().catch(() => undefined); // 중간에 중단된 fixture 는 지금 상태라도 찍는다
    console.log(`${f.tag} ${f.title} : ${f.id}`);
    console.log(`   URL     : ${config.BASE_URL}/tarot/reading?id=${f.id}`);
    console.log(`   상태    : ${f.state ?? "(상태 조회 못 함 — 중간 중단)"}`);
    console.log(`   브라우저: ${f.expect}`);
  }
  console.log(`쿠키       : byeolkong_user_id=${config.TEST_USER_ID} 주입 필요`);
  console.log(`집계       : PASS ${passed} · FAIL ${failed} · INFO ${infos}`);
}

// ── --race 모드 — 다른 탭 경합: 강제 종료선 턴이 스트리밍되는 도중 '4턴 더' 구매 (spec §7) ──
async function raceScenario() {
  preflight("══ 타로톡 인챗 결제 — 다른 탭 경합 (강제 종료선 턴 스트리밍 중 '4턴 더' 구매) ══");

  // [대본 전제] T12 가 강제 종료 턴이고, 연장이 강제 종료선을 16 으로 올려야 T12·T13 이 열린 턴이 된다
  const abs = WRAP_THRESHOLDS[SPREAD].absTurnCap;
  const absExt = effectiveAbsTurnCap(SPREAD, EXTEND_TURNS, 0);
  if (!check(`대본 전제(race) = 코드 상수 (투카드 강제 종료선 ${ABS} → 연장 뒤 ${ABS_EXTENDED} · 연장 ${EXTEND_COST}별)`, abs === ABS && absExt === ABS_EXTENDED && EXTEND_COST === 10, { abs, absExt })) {
    bail("강제 종료선이 바뀌어 T12 가 강제 종료 턴이 아니다 — 스크립트 갱신 필요", true);
  }

  console.log("\n── [준비] ──");
  await ensureTestUser();
  await topUpStars();
  S.balStart = await getBalance();

  // ── [1] 리딩 생성 + T1~T11 ──
  console.log(`\n── [1] 투카드 리딩 생성 + T1~T${ABS - 1} (구매 없음) ──`);
  const drawnCards = [0, 1].map((i) => ({
    position: i,
    label: `pos${i}`,
    card_id: QA_SEEDED_CARD_IDS[i],
    direction: "upright" as const,
  }));
  const created = await postJson<{ id?: string; duplicate?: boolean; error?: string }>("/api/consultations/tarot", {
    spreadType: SPREAD,
    spreadCategory: "love",
    emotion: EMOTION,
    concern: CONCERN_RACE,
    drawnCards,
  });
  if (!check("투카드(love) 리딩 생성 200", created.status === 200 && !!created.json.id, created)) {
    bail("리딩을 만들지 못했다", true);
  }
  if (created.json.duplicate === true) {
    bail("60초 안에 같은 리딩을 만든 적이 있어 기존 리딩이 재사용됐다(중복 생성 방어) — 1분 뒤 다시 실행");
  }
  S.readingId = created.json.id!;
  S.balAfterCreate = await getBalance();
  info(`reading id = ${S.readingId}`);
  const t1 = await runTurn(CONCERN_RACE);
  if (t1.end) bail("T1 에서 조기 [END]");
  for (let turn = 2; turn < ABS; turn++) {
    const r = await runTurn(QUESTIONS[turn - 2]);
    if (r.end) bail(`T${turn} 에서 조기 [END] (wrap=${r.wrap}, 강제 종료선 ${ABS} 전)`);
  }

  // ── [2] T12 스트리밍 도중 extend 구매 ──
  console.log(`\n── [2] T${ABS} 스트리밍 도중 '4턴 더' 구매 (다른 탭) ──`);
  const balBefore = await getBalance();
  const { turn, text, headers, leadMs, purchase: ext } = await chatWhilePurchasing(QUESTIONS[ABS - 2], () =>
    postJson<PurchaseJson>(`/api/readings/${S.readingId}/extend`, {}),
  );
  info(
    `T${turn} 답 ${text.length}자 · 스트림(화면)엔 [END] ${hasEnd(text) ? "있음" : "없음"} · end-reason=${headers["x-end-reason"] ?? "-"} reopen="${headers["x-reopen"] ?? ""}" · 구매가 스트림 종료보다 ${leadMs}ms 먼저 끝남`,
  );
  // 전제 — 이 턴이 닫는 턴이어야 아래 ★(저장본 [END] 없음)가 수정을 가른다. 강제 종료 턴은 finalizeAssistantText 가 스트림 [END] 를 보장하므로 결정적이다
  if (
    !check(
      `전제 — T${turn} 는 강제 종료 턴(스트림에 [END] · X-End-Reason=abs_cap)`,
      hasEnd(text) && headers["x-end-reason"] === "abs_cap",
      { end: hasEnd(text), endReason: headers["x-end-reason"] },
    )
  ) {
    bail(`T${turn} 가 닫는 턴이 아니라 ★ 단언이 수정과 무관하게 통과한다 — 대본 확인`, true);
  }
  if (!check("경합 성립 — 구매가 T12 스트림이 끝나기 1초 이상 전에 끝났다", leadMs >= 1000, { leadMs })) {
    bail("구매가 스트림 도중에 끝나지 않아 경합이 재현되지 않았다 — 다시 실행", true);
  }
  check(
    `extend 구매 200 · reopened=false(구매 시점엔 아직 안 닫힘) · extraTurns=${EXTEND_TURNS}`,
    ext.status === 200 && ext.json.reopened === false && ext.json.extraTurns === EXTEND_TURNS,
    ext,
  );
  const balAfter = await getBalance();
  check(`별 −${EXTEND_COST} (extend)`, balBefore - balAfter === EXTEND_COST, { before: balBefore, after: balAfter });
  const st = await assistantStats();
  check(`T${turn} DB 별콩이 답 ${turn}개`, st.count === turn, { count: st.count });
  const savedOpen = check(`★ T${turn} 저장본에 [END] 없음 — 스트림 도중 산 턴이 닫힌 채 남지 않는다`, !hasEnd(st.last), { tail: st.last.slice(-40) });
  const g = await getReading();
  check(
    "GET reopen = {extend:false, clarifier:false} — 닫히지 않았으니 재개 대상 아님",
    g.status === 200 && g.reopen?.extend === false && g.reopen?.clarifier === false,
    { status: g.status, reopen: g.reopen },
  );
  if (!savedOpen) bail(`T${turn} 저장본이 닫혀 산 턴을 쓸 수 없다 — 이후 단계 무의미`, true);

  // ── [3] T13 — 산 턴으로 이어지는가 ──
  console.log(`\n── [3] T${turn + 1} — 산 턴으로 이어지는가 ──`);
  reopenLocally(); // 새로고침하면 클라 이력은 저장본(= [END] 없음)이 된다 — 같게 맞춘다
  const r13 = await runTurn(STATEMENTS[0]);
  check(`T${r13.turn} [END] 없음 — 대화가 이어진다`, !r13.end, { wrap: r13.wrap });
  check(`T${r13.turn} X-Wrap-Mode ≠ hardcap`, r13.wrap !== "hardcap", { wrap: r13.wrap });

  // ── [4] 마무리 버튼(forceEnd) 턴 스트리밍 도중 '한 장 더' 구매 — 마무리 버튼 턴도 산 턴이 우선(사용자 결정 2026-10-05) ──
  console.log(`\n── [4] T${S.turn + 1} 마무리 버튼 스트리밍 도중 '한 장 더' 구매 (다른 탭) ──`);
  const drawnIds = (await readingRow()).drawn_cards.map((c) => c.card_id);
  const spare = QA_SEEDED_CARD_IDS.find((id) => !drawnIds.includes(id));
  if (spare === undefined) bail(`시드 덱에 안 뽑은 카드가 없다 (뽑힘 ${drawnIds.join(",")})`);
  const balBeforeFin = await getBalance();
  const fin = await chatWhilePurchasing(
    "대화 마무리할게", // app/tarot/reading/page.tsx FINISH_PHRASE — '마무리하고 결과 보기' 버튼이 보내는 문구
    () => postJson<PurchaseJson>(CLARIFIER_PATH, { readingId: S.readingId, card: { card_id: spare, direction: "upright" } }),
    true,
  );
  info(`T${fin.turn} 답 ${fin.text.length}자 · 스트림(화면)엔 [END] ${hasEnd(fin.text) ? "있음" : "없음"} · 구매가 스트림 종료보다 ${fin.leadMs}ms 먼저 끝남`);
  if (!check(`전제 — T${fin.turn} 는 마무리 버튼 턴(스트림에 [END])`, hasEnd(fin.text), { end: hasEnd(fin.text) })) {
    bail(`T${fin.turn} 가 닫는 턴이 아니라 ★ 단언이 결정과 무관하게 통과한다 — 대본 확인`, true);
  }
  if (!check("경합 성립 — 구매가 스트림이 끝나기 1초 이상 전에 끝났다", fin.leadMs >= 1000, { leadMs: fin.leadMs })) {
    bail("구매가 스트림 도중에 끝나지 않아 경합이 재현되지 않았다 — 다시 실행", true);
  }
  check(
    "clarifier 구매 200 · reopened=false(구매 시점엔 아직 안 닫힘) · clarifierCount=1",
    fin.purchase.status === 200 && fin.purchase.json.reopened === false && fin.purchase.json.clarifierCount === 1,
    { status: fin.purchase.status, json: { ...fin.purchase.json, drawnCards: undefined } },
  );
  const balAfterFin = await getBalance();
  check(`별 −${CLARIFIER_COST} (clarifier)`, balBeforeFin - balAfterFin === CLARIFIER_COST, { before: balBeforeFin, after: balAfterFin });
  const stFin = await assistantStats();
  check(`T${fin.turn} DB 별콩이 답 ${fin.turn}개`, stFin.count === fin.turn, { count: stFin.count });
  check(`★ T${fin.turn} 저장본에 [END] 없음 — 마무리 버튼 턴도 산 턴이 우선`, !hasEnd(stFin.last), { tail: stFin.last.slice(-40) });
  const gFin = await getReading();
  check(
    "GET reopen = {extend:false, clarifier:false} — 닫히지 않았으니 재개 대상 아님",
    gFin.status === 200 && gFin.reopen?.extend === false && gFin.reopen?.clarifier === false,
    { status: gFin.status, reopen: gFin.reopen },
  );
}

interface RaceTurn<T> {
  turn: number;
  text: string;
  headers: Record<string, string>;
  purchase: { status: number; json: T };
  /** 구매가 스트림 종료보다 먼저 끝난 시간(ms) — 클수록 확실히 스트림 도중에 산 것이다 */
  leadMs: number;
}

/** 유저 말을 보내고, 응답 헤더가 오면(= 서버가 reading 을 읽어 이 턴의 종료 여부를 정하고 모델 호출을 시작한 뒤 · 본문은 아직) 다른 탭 구매를 끼워 넣는다.
 *  서버는 저장(INSERT)을 마친 뒤 스트림을 닫으므로 본문을 다 읽으면 이 턴 저장도 끝났다 */
async function chatWhilePurchasing<T>(
  userText: string,
  purchase: () => Promise<{ status: number; json: T }>,
  forceEnd = false,
): Promise<RaceTurn<T>> {
  const turn = S.turn + 1;
  S.history.push({ role: "user", content: userText });
  const res = await fetch(`${config.BASE_URL}${CHAT_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `byeolkong_user_id=${config.TEST_USER_ID}` }, // qa/client.ts 와 같은 세션 쿠키
    body: JSON.stringify({ readingId: S.readingId, messages: S.history, ...(forceEnd ? { forceEnd: true } : {}) }),
  });
  if (res.status !== 200) bail(`T${turn} chat HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  let purchaseDoneAt = 0;
  const pending = purchase().then((r) => {
    purchaseDoneAt = Date.now();
    return r;
  });
  const text = await res.text();
  const streamDoneAt = Date.now();
  const bought = await pending;
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  S.history.push({ role: "assistant", content: text });
  S.turn = turn;
  return { turn, text, headers, purchase: bought, leadMs: streamDoneAt - purchaseDoneAt };
}

const FIXTURE_MODE = process.argv.includes("--fixture");
const RACE_MODE = process.argv.includes("--race");

async function main() {
  try {
    await (FIXTURE_MODE ? fixtureScenario() : RACE_MODE ? raceScenario() : scenario());
  } catch (e) {
    if (!(e instanceof Bail)) {
      failed++;
      console.log(`[FAIL] 예외: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    }
  } finally {
    await (FIXTURE_MODE ? fixtureSummary() : summary()).catch((e: unknown) => console.log(`(요약 실패: ${String(e).slice(0, 120)})`));
  }
  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAIL`);
  process.exitCode = failed === 0 ? 0 : 1;
}

// 모르는 인자(오타 `--fixtures` 등)는 기본 모드로 흘려 LLM 18회·구매를 돌리지 않게 막는다 — 인자 없는 기본 모드는 그대로. 모드는 하나만
const args = process.argv.slice(2);
const unknownArgs = args.filter((a) => a !== "--fixture" && a !== "--race");
if (unknownArgs.length > 0 || args.length > 1) {
  console.error(
    `${unknownArgs.length > 0 ? `알 수 없는 인자: ${unknownArgs.join(" ")}` : "모드는 하나만"}\n사용법: node --import tsx --env-file=.env.local scripts/smoke-inchat-offer.ts [--fixture | --race]`,
  );
  process.exit(2);
}
void main();
