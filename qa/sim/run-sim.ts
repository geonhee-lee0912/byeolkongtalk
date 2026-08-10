// qa/sim/run-sim.ts — 시뮬 8개 스타터 스모크. 판 생성 → 스크립트 유저 3턴(+자동노트/디브리핑) → 트랜스크립트 저장(읽기·튜닝).
// 실행: npm run qa:sim  (dev 서버가 떠 있어야 함 — .env.local)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.ts";
import { ensureTestUser, topUpStars, resetRelationship } from "../seed.ts";
import { postJson } from "../client.ts";
import { SITUATIONS } from "../../lib/relationship/situations.ts";
import type { RelationshipStatus } from "../../lib/relationship/types.ts";

function cookie() { return `byeolkong_user_id=${config.TEST_USER_ID}`; }

/** SSE(plain text) 스트림 소비 + 헤더 반환. */
async function postStream(path: string, body: unknown): Promise<{ text: string; headers: Record<string, string>; status: number }> {
  const res = await fetch(`${config.BASE_URL}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie() }, body: JSON.stringify(body),
  });
  const text = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  return { text, headers, status: res.status };
}

// 상황별 스크립트 유저 3턴(결정적·읽기용). 최종 톤은 이 출력을 읽고 seed/페르소나로 튜닝.
const SCRIPTS: Record<string, string[]> = {
  "crush-confess": ["요즘 너 생각 자주 나더라", "사실 나 너 좋아해", "부담됐다면 미안… 그래도 말하고 싶었어"],
  "crush-firsttext": ["오랜만이야, 잘 지냈어?", "요즘 뭐 하고 지내나 궁금해서", "다음에 시간 되면 커피 한잔 할래?"],
  "dating-hurt": ["요즘 좀 서운한 게 있었어", "약속 자꾸 미뤄질 때 나 혼자 남는 기분이야", "혼내려는 게 아니라 그냥 알아줬으면 해서"],
  "dating-makeup": ["아까는 내가 말이 심했어, 미안", "네 입장도 이제 좀 알 것 같아", "우리 이걸로 멀어지긴 싫어"],
  "onesided-approach": ["안녕! 저번에 그 얘기 재밌었어", "혹시 주말에 뭐 해?", "같이 그 전시 보러 갈래?"],
  "onesided-decide": ["요즘 너랑 얘기하는 게 제일 편해", "가끔 너 어떻게 생각하나 궁금하더라", "이런 말 하면 어색해질까?"],
  "breakup-reconnect": ["잘 지냈어? 문득 생각나서", "그때 내가 너무 서툴렀던 것 같아", "다시 얘기라도 해볼 수 있을까?"],
  "breakup-closure": ["마지막으로 하고 싶은 말이 있었어", "그동안 고마웠고 미안했어", "이제 진짜 정리하려고 해"],
};

async function main() {
  await ensureTestUser();
  await topUpStars();
  await resetRelationship(); // 유저당 관계 1개 제약 → 초기화

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(process.cwd(), "qa", "sim", "out", runId);
  mkdirSync(dir, { recursive: true });
  console.log(`[qa:sim] BASE_URL=${config.BASE_URL} → ${dir}`);

  for (const s of SITUATIONS) {
    // 상황의 관계로 상대 등록(관계당 하나라 매 상황 초기화 후 재등록).
    await resetRelationship();
    await postJson("/api/relationship/slot", {}); // 슬롯 게이트 대응(관계 생성 전 슬롯 구매)
    // sim 은 상대 프로필로 인형을 빚음 → partner 프로필 inline 생성(no_profile 게이트 통과).
    const reg = await postJson<{ id?: string }>("/api/relationship", {
      label: "QA상대",
      status: s.relationship as RelationshipStatus,
      partnerProfile: {
        displayName: "QA상대", gender: "male",
        birthDate: "1994-03-20", birthTime: null,
        isLunarInput: false, isLeapMonth: false,
        mbti: "ENFP", personality: "따뜻하고 다정하지만 가끔 무심한 편",
      },
    });
    const relationshipId = reg.json.id!;
    const create = await postStream("/api/relationship/sim", { relationshipId, situationId: s.id, userContext: "" });
    const sim = JSON.parse(create.text) as { simReadingId?: string; frame?: string };
    if (!sim.simReadingId) { writeFileSync(join(dir, `${s.id}.md`), `# ${s.id}\n\n생성 실패: ${create.status} ${create.text}\n`); continue; }

    const lines: string[] = [`# ${s.emoji} ${s.label} (${s.id} / ${s.relationship})`, ``, `**프레임 고지(별콩이 노트):** ${sim.frame}`, ``];
    let lastHeaders: Record<string, string> = {};
    for (const [i, userLine] of (SCRIPTS[s.id] ?? []).entries()) {
      const say = await postStream("/api/relationship/sim/chat", { simReadingId: sim.simReadingId, message: userLine, action: "say" });
      lastHeaders = say.headers;
      lines.push(`## 턴 ${i + 1}`, `**유저:** ${userLine}`, ``, `**인형:** ${say.text}`, ``);
    }
    const deb = await postStream("/api/relationship/sim/chat", { simReadingId: sim.simReadingId, action: "debrief" });
    let debParsed: { debrief?: string; sendMessage?: string | null } = {};
    try { debParsed = JSON.parse(deb.text); } catch { debParsed = { debrief: deb.text }; }
    lines.push(`## 디브리핑`, debParsed.debrief ?? deb.text, ``, `**💌 보낼 말:** ${debParsed.sendMessage ?? "(추출 실패)"}`, ``);
    lines.push(`---`, `_마지막 say 헤더: ${JSON.stringify(lastHeaders)}_`);
    writeFileSync(join(dir, `${s.id}.md`), lines.join("\n"));
    process.stdout.write(`✅ ${s.id}  `);
  }
  console.log(`\n[qa:sim] 완료 — ${dir} 의 8개 .md 를 읽고 인형/노트/디브리핑 품질을 튜닝해.`);
}

main().catch((e) => { console.error("[qa:sim] 치명적:", e); process.exit(1); });
