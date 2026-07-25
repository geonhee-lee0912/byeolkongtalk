// lib/relationship/compat-thread.ts — 인-스레드 궁합(compat) 리포트의 모델 맥락 치환.
// 스레드에 저장된 compat 카드는 JSON이라, 이후 턴에서 모델 최근창에 넣으면 노이즈 +
// 별콩이가 JSON을 되뇔 위험. 짧은 자연어로 치환해 연속성만 남긴다(skill_log 요약이 이중 보강).
import { tryParseStoredCompatReport } from "@/lib/fortune/compat-report";
import type { ThreadMsg } from "./memory";

/** compat JSON assistant 메시지를 "(별콩이가 우리 궁합을 봤어 — 등급, 테마)"로 치환.
 *  role·길이 불변(치환이지 필터 아님) → Anthropic alternation 유지. 순수 함수. */
export function redactCompatForModel(rows: ThreadMsg[]): ThreadMsg[] {
  return rows.map((m) => {
    if (m.role !== "assistant") return m;
    const report = tryParseStoredCompatReport(m.content);
    if (!report) return m;
    return {
      role: "assistant",
      content: `(별콩이가 우리 궁합을 봤어 — ${report.grade}, ${report.theme})`,
    };
  });
}
