// scripts/qa-cycle2-api.mjs — 사이클 2 "우리 사이" API 통합 QA + 기존 서비스 회귀.
// 실행: node --import tsx --env-file=.env.local scripts/qa-cycle2-api.mjs
// 전제: 로컬 dev 서버(localhost:3000)가 .env.local(dev Supabase)로 떠 있음.
// QA 하네스와 동일한 테스트 유저(config.TEST_USER_ID)를 재사용 — 세션은 byeolkong_user_id 쿠키.
import { getServiceSupabase } from "../lib/supabase.ts";
import { config } from "../qa/config.ts";
import { ensureTestUser, topUpStars, cleanTestData } from "../qa/seed.ts";
import { SPREAD_INFO, getPositionLabels } from "../lib/tarot/spreads.ts";
import { RELATIONSHIP_SKILLS, getSkill } from "../lib/relationship/skills.ts";
import { FORTUNE_CONFIG } from "../lib/fortune/types.ts";
import { DAILY_TURN_CAP, EXTEND_COST } from "../lib/relationship/types.ts";

const BASE = config.BASE_URL;
const UID = config.TEST_USER_ID;
const COOKIE = `byeolkong_user_id=${UID}`;
const db = getServiceSupabase();

// ───────────────────────── helpers ─────────────────────────
const results = [];
function check(id, desc, cond, extra = "") {
  results.push({ id, desc, pass: !!cond, extra });
  console.log(`${cond ? "✅" : "❌"} [${id}] ${desc}${extra ? ` — ${extra}` : ""}`);
}
function note(msg) {
  console.log(`   · ${msg}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, { body, cookie = COOKIE, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.clone().json();
  } catch {}
  return { status: res.status, headers: res.headers, json, res };
}

/** SSE(text/plain 스트림) 소비 — 전체 텍스트 + 헤더 반환 */
async function sse(path, body, cookie = COOKIE) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    let j = null;
    try {
      j = await res.json();
    } catch {}
    return { status: res.status, headers: res.headers, text: "", err: j };
  }
  const dec = new TextDecoder();
  let text = "";
  for await (const chunk of res.body) text += dec.decode(chunk, { stream: true });
  return { status: res.status, headers: res.headers, text };
}

async function balance() {
  const { data } = await db.from("star_balances").select("balance").eq("user_id", UID).single();
  return data?.balance ?? 0;
}
async function getRel() {
  const { data } = await db.from("relationships").select("*").eq("user_id", UID).maybeSingle();
  return data;
}
/** 스레드에 메시지 n쌍 시드 (user/assistant 교차, 오늘 KST) */
async function seedThreadMsgs(threadId, pairs, prefix = "seed") {
  const rows = [];
  const base = Date.now() - pairs * 2000;
  for (let i = 0; i < pairs; i++) {
    rows.push({ reading_id: threadId, role: "user", content: `${prefix}-u${i}`, created_at: new Date(base + i * 2000).toISOString() });
    rows.push({ reading_id: threadId, role: "assistant", content: `${prefix}-a${i}`, created_at: new Date(base + i * 2000 + 1).toISOString() });
  }
  const { error } = await db.from("messages").insert(rows);
  if (error) throw new Error(`seed msgs: ${error.message}`);
}
async function threadMsgs(threadId) {
  const { data } = await db.from("messages").select("role, content").eq("reading_id", threadId).order("created_at", { ascending: true });
  return data ?? [];
}
async function pollUntil(fn, { timeoutMs = 30000, intervalMs = 2500 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await sleep(intervalMs);
  }
  return null;
}

const PARTNER = {
  displayName: "큐에이상대",
  birthDate: "1995-03-15",
  birthTime: "10:30",
  isLunarInput: false,
  isLeapMonth: false,
  gender: "female",
};

// ───────────────────────── 0. setup ─────────────────────────
console.log(`\n═══ 사이클2 통합 QA — BASE=${BASE}, user=${UID.slice(0, 8)} ═══\n`);
await ensureTestUser();
// 이전 QA 잔재 정리 (테스트 유저 한정!)
await db.from("relationships").delete().eq("user_id", UID); // passes CASCADE
await cleanTestData(); // readings/messages/sensitive
await db.from("user_profiles").delete().eq("user_id", UID);
await topUpStars();
const bal0 = await balance();
note(`시드 완료 — 잔액 ${bal0}`);

// self primary 프로필 (compat 스킬 조건)
const { data: selfProf, error: selfErr } = await db
  .from("user_profiles")
  .insert({ user_id: UID, display_name: "큐에이", relation_type: "self", birth_date: "1994-05-20", birth_time: "08:30", is_lunar_input: false, is_leap_month: false, gender: "male", is_primary: true })
  .select("id")
  .single();
if (selfErr) throw new Error(`self profile: ${selfErr.message}`);

// ───────────────────────── A. 인증 게이트 ─────────────────────────
{
  const a1 = await api("GET", "/api/relationship", { cookie: null });
  check("A1", "GET /api/relationship 비로그인 → relationship:null", a1.status === 200 && a1.json?.relationship === null);
  const a2 = await api("POST", "/api/relationship", { cookie: null, body: { label: "x", status: "dating" } });
  check("A2", "POST 등록 비로그인 → 401", a2.status === 401);
  const a3 = await sse("/api/relationship/chat", { relationshipId: "00000000-0000-4000-8000-000000000000", message: "hi" }, "");
  check("A3", "스레드 chat 비로그인 → 401", a3.status === 401);
}

// ───────────────────────── B. 등록 ─────────────────────────
let relId, threadId, partnerProfileId;
{
  const b1 = await api("POST", "/api/relationship", {
    body: { label: "그이", status: "dating", selfProfileId: selfProf.id, partnerProfile: PARTNER },
  });
  check("B1", "등록 성공(+self/partner)", b1.status === 200 && b1.json?.success && b1.json?.threadReadingId, JSON.stringify(b1.json));
  const rel = await getRel();
  relId = rel?.id;
  threadId = rel?.thread_reading_id;
  partnerProfileId = rel?.partner_profile_id;
  check("B2", "DB: relationships + thread_reading_id + partner 링크", !!relId && !!threadId && !!partnerProfileId && rel.self_profile_id === selfProf.id);
  const { data: thr } = await db.from("readings").select("consultation_type, relationship_id, stars_spent").eq("id", threadId).single();
  check("B3", "스레드 reading = relationship/무료/관계귀속", thr?.consultation_type === "relationship" && thr?.relationship_id === relId && thr?.stars_spent === 0);
  const b4 = await api("POST", "/api/relationship", { body: { label: "다른호칭", status: "crush" } });
  check("B4", "재등록 멱등 → existed:true (중복 생성 없음)", b4.status === 200 && b4.json?.existed === true);
  const b5 = await api("GET", "/api/relationship");
  check("B5", "GET: relationship+pass:null+messages:[]", b5.json?.relationship?.id === relId && b5.json?.pass === null && Array.isArray(b5.json?.messages) && b5.json.messages.length === 0);
}

// ───────────────────────── C. 패스 게이트/구매/중첩 ─────────────────────────
{
  const c1 = await sse("/api/relationship/chat", { relationshipId: relId, message: "안녕" });
  check("C1", "패스 없이 chat → 402 pass_required", c1.status === 402 && c1.err?.error === "pass_required");
  const c2 = await api("POST", "/api/relationship/pass", { body: { relationshipId: relId, kind: "day30" } });
  check("C2", "잘못된 kind → 400", c2.status === 400);
  const balBefore = await balance();
  const c3 = await api("POST", "/api/relationship/pass", { body: { relationshipId: relId, kind: "day1" } });
  const balAfter1 = await balance();
  check("C3", "day1 구매 → 20별 차감 + expiresAt≈+1일", c3.status === 200 && c3.json?.success && balBefore - balAfter1 === 20 && Math.abs(new Date(c3.json.expiresAt) - Date.now() - 864e5) < 60_000, `exp=${c3.json?.expiresAt}`);
  const exp1 = new Date(c3.json.expiresAt).getTime();
  const c4 = await api("POST", "/api/relationship/pass", { body: { relationshipId: relId, kind: "day3" } });
  const balAfter2 = await balance();
  check("C4", "활성 중 day3 재구매 → 만료 이어붙임(+3일) + 40별 차감", c4.status === 200 && balAfter1 - balAfter2 === 40 && Math.abs(new Date(c4.json.expiresAt).getTime() - (exp1 + 3 * 864e5)) < 60_000, `exp=${c4.json?.expiresAt}`);
  const { count: passCnt } = await db.from("relationship_passes").select("id", { count: "exact", head: true }).eq("relationship_id", relId);
  const { count: txCnt } = await db.from("star_transactions").select("id", { count: "exact", head: true }).eq("user_id", UID).eq("source", "relationship_pass");
  check("C5", "passes 2행 + tx(relationship_pass) 2행", passCnt === 2 && txCnt === 2, `passes=${passCnt}, tx=${txCnt}`);
}

// ───────────────────────── D. 스레드 대화 (실 Claude) ─────────────────────────
{
  const d1 = await sse("/api/relationship/chat", { relationshipId: relId, message: "요즘 그이랑 연락이 뜸해져서 마음이 복잡해." });
  const msgs1 = await threadMsgs(threadId);
  check("D1", "첫 대화 SSE 정상 + 저장 + Cap:ok", d1.status === 200 && d1.text.length > 50 && d1.headers.get("x-daily-cap") === "ok" && msgs1.length === 2, `${d1.text.length}자`);
  check("D2", "스레드 응답에 [END] 없음", !d1.text.includes("[END]"));
  const relAfterD1 = await getRel();
  check("D3", "last_visited_at 갱신", !!relAfterD1?.last_visited_at);
  note(`응답 미리보기: ${d1.text.slice(0, 80).replace(/\n/g, " ")}…`);
  await sleep(1500);

  // 복귀 체크인 — pending + 7h 전 방문으로 세팅 → 다음 턴 소진(결정적) + 안부(소프트)
  await db.from("relationships").update({
    memo: { ...(relAfterD1.memo ?? {}), pending_checkin: { text: "먼저 연락해보기", created_at: new Date().toISOString() } },
    last_visited_at: new Date(Date.now() - 7 * 3600e3).toISOString(),
  }).eq("id", relId);
  const d4 = await sse("/api/relationship/chat", { relationshipId: relId, message: "나 왔어" });
  const relAfterD4 = await getRel();
  const consumed = relAfterD4?.memo?.pending_checkin == null && (relAfterD4?.memo?.prescriptions ?? []).some((p) => p.text === "먼저 연락해보기" && p.resolved_at);
  check("D4", "복귀 체크인 소진 → prescriptions resolved 이동", d4.status === 200 && consumed, JSON.stringify(relAfterD4?.memo?.prescriptions ?? []).slice(0, 120));
  note(`복귀 안부 응답: ${d4.text.slice(0, 100).replace(/\n/g, " ")}…`);
  await sleep(1500);

  // 소프트캡 — 오늘 user 턴을 캡 이상으로 시드 → reached
  await seedThreadMsgs(threadId, DAILY_TURN_CAP, "cap");
  const d5 = await sse("/api/relationship/chat", { relationshipId: relId, message: "조금만 더 얘기하자" });
  check("D5", `소프트캡(${DAILY_TURN_CAP}턴) 도달 → X-Daily-Cap: reached (응답은 정상)`, d5.status === 200 && d5.headers.get("x-daily-cap") === "reached" && d5.text.length > 20);
  await sleep(1500);

  // 연장 — 5별, 무제한. GET daily 로 allowance 산술 검증 (Claude 호출 없이)
  const balBeforeExt = await balance();
  const e1 = await api("POST", "/api/relationship/extend", { body: { relationshipId: relId } });
  const balAfterExt = await balance();
  const g1 = await api("GET", "/api/relationship");
  check("D6", `연장 → ${EXTEND_COST}별 차감 + allowance ${DAILY_TURN_CAP + 5}`, e1.status === 200 && balBeforeExt - balAfterExt === EXTEND_COST && g1.json?.daily?.allowance === DAILY_TURN_CAP + 5, `daily=${JSON.stringify(g1.json?.daily)}`);
  const e2 = await api("POST", "/api/relationship/extend", { body: { relationshipId: relId } });
  const g2 = await api("GET", "/api/relationship");
  check("D7", "연장 2회째도 허용(무제한) → allowance +10", e2.status === 200 && g2.json?.daily?.allowance === DAILY_TURN_CAP + 10);

  // 민감 감지 — 헤더 + alert + has_sensitive
  const d8 = await sse("/api/relationship/chat", { relationshipId: relId, message: "요즘 너무 힘들어서 죽고 싶다는 생각이 들어" });
  const { count: alertCnt } = await db.from("sensitive_alerts").select("id", { count: "exact", head: true }).eq("user_id", UID);
  const { data: thrSens } = await db.from("readings").select("has_sensitive").eq("id", threadId).single();
  check("D8", "위기 감지 → X-Sensitive 헤더 + alert 기록 + has_sensitive", d8.status === 200 && !!d8.headers.get("x-sensitive-category") && (alertCnt ?? 0) >= 1 && thrSens?.has_sensitive === true, `cat=${d8.headers.get("x-sensitive-category")}`);
  await sleep(1500);

  // 임계 요약 — 메시지 많이 시드 → 다음 턴에 rolling_summary 갱신(fire-and-forget)
  await seedThreadMsgs(threadId, 30, "hist"); // user 30 + assistant 30 추가 → older 창 확보
  const d9 = await sse("/api/relationship/chat", { relationshipId: relId, message: "정리하면 요즘 우리 사이 어떤 것 같아?" });
  const summarized = await pollUntil(async () => {
    const r = await getRel();
    return r?.rolling_summary && r.summarized_msg_count > 0 ? r : null;
  }, { timeoutMs: 45000 });
  check("D9", "임계 요약 발동 → rolling_summary + summarized_msg_count", d9.status === 200 && !!summarized, summarized ? `${summarized.summarized_msg_count}개 요약됨, ${String(summarized.rolling_summary).length}자` : "45s 내 미발동");
}

// ───────────────────────── E. 스킬 ─────────────────────────
{
  // 가격 일관성 (정적)
  const chk = getSkill("checkin"), deep = getSkill("deep_feelings"), comp = getSkill("compat"), verd = getSkill("verdict");
  const priceOk =
    chk.starCost === SPREAD_INFO[chk.spread].starCost &&
    deep.starCost === SPREAD_INFO[deep.spread].starCost &&
    comp.starCost === FORTUNE_CONFIG.compat.cost &&
    verd.starCost === 30;
  check("E1", "스킬 가격 = 실제 차감원(스프레드/운세 config) 일치", priceOk, `checkin ${chk.starCost}/${SPREAD_INFO[chk.spread].starCost}, deep ${deep.starCost}/${SPREAD_INFO[deep.spread].starCost}, compat ${comp.starCost}/${FORTUNE_CONFIG.compat.cost}`);

  // 위조 차단 — one_card 를 checkin 스킬로 태깅 시도
  const cards1 = [{ position: 0, label: "질문의 답", card_id: 3, direction: "upright" }];
  const e2 = await api("POST", "/api/consultations/tarot", { body: { spreadType: "one_card", spreadCategory: "love", emotion: "걔 속마음이 궁금해", concern: "우리 사이 테스트", drawnCards: cards1, relationshipId: relId, skillKey: "checkin" } });
  check("E2", "스킬-스프레드 불일치 위조 → 400", e2.status === 400, JSON.stringify(e2.json));

  // 관계 체크인(checkin_6) 정상 생성 + forceEnd 로 [END] → skill_log
  const labels = getPositionLabels("checkin_6", "love");
  const cards6 = labels.map((label, i) => ({ position: i, label, card_id: 10 + i, direction: i % 2 ? "reversed" : "upright" }));
  const balBefore = await balance();
  const e3 = await api("POST", "/api/consultations/tarot", { body: { spreadType: "checkin_6", spreadCategory: "love", emotion: "걔 속마음이 궁금해", concern: "우리 사이 · 관계 체크인", drawnCards: cards6, relationshipId: relId, skillKey: "checkin" } });
  const balAfter = await balance();
  const { data: skillReading } = e3.json?.id ? await db.from("readings").select("relationship_id, skill_key, consultation_type, stars_spent").eq("id", e3.json.id).single() : { data: null };
  check("E3", "체크인 스킬 생성 → 태깅 + 45별", e3.status === 200 && skillReading?.relationship_id === relId && skillReading?.skill_key === "checkin" && skillReading?.consultation_type === "tarot" && balBefore - balAfter === 45);
  const e4 = await sse("/api/consultations/tarot/chat", { readingId: e3.json.id, messages: [{ role: "user", content: "우리 사이 · 관계 체크인" }], forceEnd: true });
  const logAfterE4 = await pollUntil(async () => {
    const r = await getRel();
    return (r?.memo?.skill_log ?? []).some((s) => s.skill === "checkin") ? r : null;
  }, { timeoutMs: 15000 });
  check("E4", "체크인 [END] → memo.skill_log 적립", e4.status === 200 && e4.text.includes("[END]") && !!logAfterE4, JSON.stringify(logAfterE4?.memo?.skill_log?.at(-1) ?? {}).slice(0, 140));
  await sleep(1500);

  // verdict — 생성(30별) → 4턴 시드 → 5턴째 강제 [END] + skill_log
  const balV0 = await balance();
  const e5 = await api("POST", "/api/relationship/verdict", { body: { relationshipId: relId } });
  const balV1 = await balance();
  const { data: vReading } = e5.json?.id ? await db.from("readings").select("consultation_type, skill_key, relationship_id, stars_spent").eq("id", e5.json.id).single() : { data: null };
  check("E5", "판정 생성 → relationship/verdict 태깅 + 30별", e5.status === 200 && vReading?.consultation_type === "relationship" && vReading?.skill_key === "verdict" && balV0 - balV1 === 30);
  const vId = e5.json.id;
  const hist = [];
  for (let i = 0; i < 4; i++) {
    hist.push({ role: "user", content: i === 0 ? "어제 데이트 약속 시간 때문에 싸웠어" : `추가 상황 설명 ${i}` });
    hist.push({ role: "assistant", content: `(별콩이 청취 ${i})` });
  }
  await db.from("messages").insert(hist.map((m, i) => ({ reading_id: vId, role: m.role, content: m.content, created_at: new Date(Date.now() - (8 - i) * 1000).toISOString() })));
  const e6 = await sse("/api/relationship/verdict/chat", { readingId: vId, messages: [...hist, { role: "user", content: "그래서 누가 더 잘못한 거야?" }] });
  const logAfterV = await pollUntil(async () => {
    const r = await getRel();
    return (r?.memo?.skill_log ?? []).some((s) => s.skill === "verdict") ? r : null;
  }, { timeoutMs: 15000 });
  check("E6", "판정 5턴째 강제 [END] + skill_log", e6.status === 200 && e6.text.includes("[END]") && !!logAfterV, `${e6.text.length}자`);
  note(`판정 응답: ${e6.text.slice(0, 120).replace(/\n/g, " ")}…`);
  await sleep(1500);

  // compat 스킬 — 생성 + 태깅 + (리포트 완료 후) skill_log
  const balC0 = await balance();
  const e7 = await api("POST", "/api/fortune/create", { body: { type: "compat", profileA: selfProf.id, profileB: partnerProfileId, relationshipId: relId } });
  const balC1 = await balance();
  const { data: cReading } = e7.json?.id ? await db.from("readings").select("relationship_id, skill_key").eq("id", e7.json.id).single() : { data: null };
  check("E7", "궁합 스킬 생성 → compat 태깅 + 40별", e7.status === 200 && cReading?.relationship_id === relId && cReading?.skill_key === "compat" && balC0 - balC1 === 40, JSON.stringify(e7.json).slice(0, 100));
  const logAfterC = await pollUntil(async () => {
    const r = await getRel();
    return (r?.memo?.skill_log ?? []).some((s) => s.skill === "compat") ? r : null;
  }, { timeoutMs: 120000, intervalMs: 5000 });
  check("E8", "궁합 리포트 완료 → skill_log 적립 (생성 대기 ≤120s)", !!logAfterC, logAfterC ? JSON.stringify(logAfterC.memo.skill_log.at(-1)).slice(0, 140) : "120s 내 미완료(느린 생성일 수 있음)");

  // 패스 게이트 (스킬) — 패스 만료시켜 검증 후 복원
  await db.from("relationship_passes").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("relationship_id", relId);
  const e9 = await api("POST", "/api/relationship/verdict", { body: { relationshipId: relId } });
  check("E9", "패스 만료 시 스킬 → 402 pass_required", e9.status === 402 && e9.json?.error === "pass_required");
  await db.from("relationship_passes").update({ expires_at: new Date(Date.now() + 864e5).toISOString() }).eq("relationship_id", relId);
}

// ───────────────────────── F. 보관함 필터 ─────────────────────────
{
  const f1 = await api("GET", "/api/readings");
  const list = f1.json?.readings ?? [];
  const hasThread = list.some((r) => r.id === threadId);
  const hasVerdict = list.some((r) => r.consultationType === "relationship");
  const hasCheckin = list.some((r) => r.spreadType === "checkin_6");
  check("F1", "보관함: 스레드/판정 제외 + 체크인(타로) 포함", !hasThread && !hasVerdict && hasCheckin, `목록 ${list.length}건`);
}

// ───────────────────────── G. 수정/강등 ─────────────────────────
{
  const g1 = await api("PATCH", "/api/relationship", { body: { label: "그 사람", status: "breakup" } });
  const relG = await getRel();
  check("G1", "PATCH 호칭/상태 반영", g1.status === 200 && relG?.label === "그 사람" && relG?.status === "breakup");

  // partner 프로필 삭제 → SET NULL 강등 (스레드/기억 보존)
  await db.from("user_profiles").delete().eq("id", partnerProfileId);
  const relG2 = await getRel();
  const msgsStill = await threadMsgs(threadId);
  check("G2", "partner 삭제 → SET NULL + 스레드/기억 보존", relG2?.partner_profile_id === null && relG2?.thread_reading_id === threadId && msgsStill.length > 0 && !!relG2?.rolling_summary);

  const g3 = await api("PATCH", "/api/relationship", { body: { partnerProfile: PARTNER } });
  const relG3 = await getRel();
  check("G3", "PATCH 상대 생일 재등록 → 새 partner 링크", g3.status === 200 && !!relG3?.partner_profile_id && relG3.partner_profile_id !== partnerProfileId);
}

// ───────────────────────── H. 기존 서비스 회귀 ─────────────────────────
{
  // 일반 타로 (관계 무관) — 태깅 없음 + 정상 차감
  const balH0 = await balance();
  const cards3 = getPositionLabels("three_card", "love").map((label, i) => ({ position: i, label, card_id: 30 + i, direction: "upright" }));
  const h1 = await api("POST", "/api/consultations/tarot", { body: { spreadType: "three_card", spreadCategory: "love", emotion: "재회할 수 있을까", concern: "회귀 테스트용 일반 타로 상담이야", drawnCards: cards3 } });
  const balH1 = await balance();
  const { data: hReading } = h1.json?.id ? await db.from("readings").select("relationship_id, skill_key").eq("id", h1.json.id).single() : { data: null };
  check("H1", "일반 타로 생성 → 태깅 없음 + 25별", h1.status === 200 && hReading?.relationship_id === null && hReading?.skill_key === null && balH0 - balH1 === 25);

  const skillLogBefore = ((await getRel())?.memo?.skill_log ?? []).length;
  const h2 = await sse("/api/consultations/tarot/chat", { readingId: h1.json.id, messages: [{ role: "user", content: "회귀 테스트용 일반 타로 상담이야" }], forceEnd: true });
  await sleep(3000);
  const skillLogAfter = ((await getRel())?.memo?.skill_log ?? []).length;
  check("H2", "일반 타로 chat [END] 정상 + skill_log 불변", h2.status === 200 && h2.text.includes("[END]") && skillLogBefore === skillLogAfter, `${h2.text.length}자`);

  // 일반 compat (관계 무관) — 태깅 없음 (리포트 완료는 대기 안 함)
  const h3 = await api("POST", "/api/fortune/create", { body: { type: "compat", profileA: selfProf.id, profileB: (await getRel()).partner_profile_id } });
  const { data: h3Reading } = h3.json?.id ? await db.from("readings").select("relationship_id, skill_key").eq("id", h3.json.id).single() : { data: null };
  check("H3", "일반 궁합 생성 → 태깅 없음", h3.status === 200 && h3Reading?.relationship_id === null && h3Reading?.skill_key === null, JSON.stringify(h3.json).slice(0, 100));

  const h4 = await api("GET", "/api/stars/balance");
  check("H4", "잔액 API 정상", h4.status === 200 && typeof (h4.json?.balance ?? h4.json?.stars ?? null) === "number", JSON.stringify(h4.json));

  const h5 = await api("GET", "/api/readings");
  check("H5", "보관함에 일반 타로 노출", (h5.json?.readings ?? []).some((r) => r.id === h1.json.id));
}

// ───────────────────────── I. 탈퇴 CASCADE ─────────────────────────
{
  const U2 = "22222222-2222-4222-8222-222222222222";
  await db.from("users").delete().eq("id", U2);
  const { error: u2Err } = await db.from("users").insert({ id: U2, kakao_id: -999002, nickname: "QA탈퇴봇" });
  if (u2Err) throw new Error(`user2: ${u2Err.message}`);
  await db.from("star_balances").insert({ user_id: U2, balance: 100 });
  const C2 = `byeolkong_user_id=${U2}`;
  const r1 = await api("POST", "/api/relationship", { cookie: C2, body: { label: "u2상대", status: "crush", partnerProfile: PARTNER } });
  await api("POST", "/api/relationship/pass", { cookie: C2, body: { relationshipId: r1.json.id, kind: "day1" } });
  await db.from("messages").insert({ reading_id: r1.json.threadReadingId, role: "user", content: "cascade test" });
  // users 삭제 → 전 체인 정리 (withdraw 라우트의 DB 단계와 동일 CASCADE)
  const { error: delErr } = await db.from("users").delete().eq("id", U2);
  const [{ count: relCnt }, { count: passCnt }, { count: readCnt }] = await Promise.all([
    db.from("relationships").select("id", { count: "exact", head: true }).eq("user_id", U2),
    db.from("relationship_passes").select("id", { count: "exact", head: true }).eq("user_id", U2),
    db.from("readings").select("id", { count: "exact", head: true }).eq("user_id", U2),
  ]);
  check("I1", "탈퇴(users DELETE) → relationships/passes/readings CASCADE 정리", !delErr && relCnt === 0 && passCnt === 0 && readCnt === 0, delErr?.message ?? "");
}

// ───────────────────────── 마무리 리포트 ─────────────────────────
const fails = results.filter((r) => !r.pass);
console.log(`\n═══ 결과: ${results.length - fails.length}/${results.length} PASS ═══`);
if (fails.length) {
  console.log("FAILED:");
  for (const f of fails) console.log(`  ❌ [${f.id}] ${f.desc}${f.extra ? ` — ${f.extra}` : ""}`);
}
// 테스트 데이터는 브라우저 E2E 에서 재사용하므로 여기선 정리하지 않음 (정리는 별도 --clean)
if (process.argv.includes("--clean")) {
  await db.from("relationships").delete().eq("user_id", UID);
  await cleanTestData();
  await db.from("user_profiles").delete().eq("user_id", UID);
  console.log("(테스트 데이터 정리 완료)");
}
process.exit(fails.length ? 1 : 0);
