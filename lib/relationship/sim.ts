// lib/relationship/sim.ts — 시뮬 엔진 순수 헬퍼 + 판 메타 타입. 라우트에서 조립.
import { SIM_TURN_CAP, SIM_FREE_RUNWAY, SIM_HOOK_INTERVAL_DAYS } from "./types";

/** reading.saju_data 에 부속되는 시뮬 판 메타(스펙 §8 — 기존 saju_data 패턴 재사용). */
export interface SimMeta {
  situationId: string;
  userContext: string | null; // ①-b 라이트 컨텍스트(없으면 null)
  phase: "stage" | "debriefed";
  insight?: string; // 디브리핑 통찰(축약 저장, 선택)
  sendMessage?: string; // 💌 보낼 말
  /** 판 자금원 — 무료 런웨이/훅/유료. 게이팅·측정 소스(스펙 §3·§6). 없으면 레거시=paid 취급. */
  funding?: "runway" | "hook" | "paid";
}

/** 인형 대화 abs-cap 도달 시 디브리핑 강제. 위기 판(has_sensitive)은 억제(안전>원가, 스펙 §5). */
export function simForceDebrief(args: { dollTurns: number; hasSensitive: boolean }): boolean {
  if (args.hasSensitive) return false;
  return args.dollTurns >= SIM_TURN_CAP;
}

const SIM_SEND_RE = /\[SEND:([^\]]+)\]/;

/** 디브리핑 응답에서 보낼 말 한 문장 추출([SEND:...] 마커). 없으면 null. */
export function extractSendLine(text: string): string | null {
  const m = text.match(SIM_SEND_RE);
  return m ? m[1].trim() : null;
}

/** 화면 표시용 — [SEND:...]·[PORTRAIT:...] 마커 제거 + 여백 정리. */
export function stripSimMarkers(text: string): string {
  return text
    .replace(/\[SEND:[^\]]*\]/g, "")
    .replace(/\[PORTRAIT:[^\]]*\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 답변 추천 응답에서 [SAY:제안]/[WHY:이유] 쌍을 순서대로 최대 3개 추출. 이유 마커 없으면 "". 없으면 빈 배열. */
export function extractSuggestions(raw: string): { say: string; why: string }[] {
  const says = [...raw.matchAll(/\[SAY:([^\]]+)\]/g)].map((m) => m[1].trim());
  const whys = [...raw.matchAll(/\[WHY:([^\]]+)\]/g)].map((m) => m[1].trim());
  const out: { say: string; why: string }[] = [];
  for (let i = 0; i < says.length && out.length < 3; i++) {
    if (says[i]) out.push({ say: says[i], why: whys[i] ?? "" });
  }
  return out;
}

/** 인형↔유저 대화를 별콩이 노트/디브리핑 호출의 컨텍스트 텍스트로. (별콩이는 제3자라 대화를
 *  messages 로 못 넘김 — verdict/compat 처럼 텍스트 블록으로 주입.) */
export function buildSimContextBlock(convo: { role: "user" | "assistant"; content: string }[]): string {
  return convo.map((m) => `${m.role === "user" ? "유저" : "인형"}: ${m.content}`).join("\n");
}

/** 인형 프롬프트에 주입할 상대 프로필 라인(있는 필드만). 사주는 MVP 제외 — 관계·MBTI·성격이 인격을 만든다. */
export function formatPartnerForDoll(p: { statusLabel: string; mbti: string | null; personality: string | null }): string {
  const lines = [`관계: ${p.statusLabel}`];
  if (p.mbti) lines.push(`MBTI: ${p.mbti}`);
  if (p.personality?.trim()) lines.push(`한 줄 성격: ${p.personality.trim()}`);
  return lines.join("\n");
}

/** 상대 성격 서술에 피드백 노트를 불릿 한 줄로 append. 빈 기존값·공백 안전.
 *  시뮬 교정(👎 실제론 ~해 / 👍 이런 면이 걔다워)이 personality 로 누적되는 통로 —
 *  프로필 화면에도 그대로 노출되므로 서술형으로 쌓는다(스펙 2026-08-07). */
export function appendPersonalityNote(existing: string | null, note: string): string {
  const clean = note.trim();
  const base = (existing ?? "").trim();
  if (!clean) return base;
  return base ? `${base}\n· ${clean}` : `· ${clean}`;
}

/** 밤 무대 프레임 고지(결정적 별콩이 노트). POST /sim 생성 시 시드 + GET 재진입 시 재구성 — 단일 원천. */
export function buildSimFrame(relLabel: string, situationLabel: string): string {
  return `여긴 네 마음속 ${relLabel} 인형이 서는 무대야 — 네가 알려준 설명으로 그렸지, 진짜 걔는 아니야. "${situationLabel}" 상황을 편하게 연습해봐. 인형이 실제 걔랑 다르면 대사 밑 👍👎로 알려주면 내가 더 걔답게 만들어줄게. 무슨 말을 할지 막히면 아래 '답변 추천'을, 충분히 해봤으면 '마무리'를 눌러 정리하면 돼.`;
}

/** 판 자금원 결정(서버 게이트). runwayUsed=이 관계의 기존 runway 판 수, hookLastAt=이 유저의 최근 hook 판 시각.
 *  런웨이 소진 전=runway / 소진 후 7일 롤링 지났으면 hook / 아니면 paid. 순수 함수(라우트가 쿼리 주입). */
export function resolveFunding(args: {
  runwayUsed: number;
  hookLastAt: string | null;
  now: Date;
}): "runway" | "hook" | "paid" {
  if (args.runwayUsed < SIM_FREE_RUNWAY) return "runway";
  if (!args.hookLastAt) return "hook";
  const elapsedDays = (args.now.getTime() - new Date(args.hookLastAt).getTime()) / 86_400_000;
  return elapsedDays >= SIM_HOOK_INTERVAL_DAYS ? "hook" : "paid";
}

const SIM_PORTRAIT_RE = /\[PORTRAIT:([^\]]+)\]/g;

/** 디브리핑 응답에서 [PORTRAIT:관찰] 마커를 최대 2개 추출(초상화 누적용). 없으면 빈 배열. */
export function extractPortraitObservations(raw: string): string[] {
  return [...raw.matchAll(SIM_PORTRAIT_RE)].map((m) => m[1].trim()).filter(Boolean).slice(0, 2);
}

/** 후보 관찰 중 기존 초상화(personality)와 근접 중복인 것을 버린다. 정규화(공백·불릿·문장부호 제거) 후 포함관계로 판정. */
export function dedupPortraitNotes(existing: string | null, candidates: string[]): string[] {
  const norm = (s: string) => s.replace(/[·\s.,!?~]/g, "").toLowerCase();
  const base = norm(existing ?? "");
  const out: string[] = [];
  for (const c of candidates) {
    const nc = norm(c);
    if (!nc) continue;
    if (base.includes(nc) || out.some((o) => norm(o).includes(nc) || nc.includes(norm(o)))) continue;
    out.push(c);
  }
  return out;
}

/** 허브 시뮬 카드의 무료 배지 라벨(쿼트 기반). 쿼트 없으면(로딩/실패) null → 배지 생략. */
export function simFreeBadge(
  q: { funding: "runway" | "hook" | "paid"; cost: number; runwayRemaining: number } | null
): string | null {
  if (!q) return null;
  if (q.funding === "runway") return `무료 ${q.runwayRemaining}판 남음`;
  if (q.funding === "hook") return "이번 주 무료 판";
  return `판당 ${q.cost}별`;
}
