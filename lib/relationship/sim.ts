// lib/relationship/sim.ts — 시뮬 엔진 순수 헬퍼 + 판 메타 타입. 라우트에서 조립.
import { SIM_TURN_CAP } from "./types";

/** reading.saju_data 에 부속되는 시뮬 판 메타(스펙 §8 — 기존 saju_data 패턴 재사용). */
export interface SimMeta {
  situationId: string;
  userContext: string | null; // ①-b 라이트 컨텍스트(없으면 null)
  phase: "stage" | "debriefed";
  insight?: string; // 디브리핑 통찰(축약 저장, 선택)
  sendMessage?: string; // 💌 보낼 말
}

/** 자동 노트 스로틀 — 매 턴 X, 인형 3턴마다 1회(원가·소음 관리, 스펙 §5). 2턴 이전엔 안 냄.
 *  온디맨드(💭)는 이 함수를 안 타고 무조건 허용. 트리거 휴리스틱은 QA 튜닝 대상(§5·§11). */
export function shouldAutoNote(dollTurns: number): boolean {
  return dollTurns >= 3 && dollTurns % 3 === 0;
}

/** 소프트 수렴 — 판이 후반부(SIM_TURN_CAP-3 이상)면 별콩이 노트가 정리(디브리핑)를 부드럽게 권하도록 신호.
 *  하드 게이트(simForceDebrief)와 별개: 이건 강요가 아니라 유도. 유저가 원하면 계속(스펙 §2·오너결정 2026-08-07). */
export function shouldSuggestWrap(dollTurns: number): boolean {
  return dollTurns >= SIM_TURN_CAP - 3;
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

/** 화면 표시용 — [SEND:...] 마커 제거 + 여백 정리. */
export function stripSimMarkers(text: string): string {
  return text.replace(/\[SEND:[^\]]*\]/g, "").replace(/\n{3,}/g, "\n\n").trim();
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
