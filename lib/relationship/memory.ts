// lib/relationship/memory.ts — 스레드 기억: 최근 N턴 원문 + 임계치 요약 + 구조화 파일
import { RELATIONSHIP_STATUS_LABELS, type RelationshipStatus, type RelationshipMemo } from "./types";

/** API messages로 보낼 최근 메시지 수(user+assistant 합). 실측 튜닝. */
export const RECENT_MSGS = 24;      // 약 12턴
/** 미요약 older가 이만큼 쌓이면 요약 트리거. */
export const SUMMARY_TRIGGER = 32;  // 약 16턴

export interface ThreadMsg { role: "user" | "assistant"; content: string; }

export interface ThreadSplit {
  apiMessages: ThreadMsg[];        // 최근 원문 (Claude 입력)
  toSummarize: ThreadMsg[];        // 이번에 요약할 older 델타 ([] = 요약 안 함)
  newSummarizedCount: number;      // 요약 후 저장할 summarized_msg_count
}

/**
 * 전체 스레드 메시지(오름차순) + 이미 요약된 개수 → 최근창/요약델타 분할.
 * older = 최근창 밖. 미요약 older(older.slice(summarizedCount))가 SUMMARY_TRIGGER 이상이면 요약.
 */
export function splitThreadMessages(all: ThreadMsg[], summarizedCount: number): ThreadSplit {
  const recentStart = Math.max(0, all.length - RECENT_MSGS);
  const apiMessages = all.slice(recentStart);
  const older = all.slice(0, recentStart);
  const alreadic = Math.min(summarizedCount, older.length);
  const unsummarized = older.slice(alreadic);
  if (unsummarized.length >= SUMMARY_TRIGGER) {
    return { apiMessages, toSummarize: unsummarized, newSummarizedCount: older.length };
  }
  return { apiMessages, toSummarize: [], newSummarizedCount: summarizedCount };
}

export interface RelationshipFile {
  label: string;
  status: RelationshipStatus | string;
  hasSelfBirth: boolean;
  hasPartnerBirth: boolean;
  memo: RelationshipMemo;
}

/** system dynamicPart에 넣을 구조화 파일 블록 (결정적 — 요약 드리프트로 안 잃음). */
export function buildRelationshipFileBlock(f: RelationshipFile, rollingSummary: string | null): string {
  const statusLabel = RELATIONSHIP_STATUS_LABELS[f.status as RelationshipStatus] ?? f.status;
  const lines: string[] = [
    `## 관계 파일`,
    `[호칭: ${f.label}] [관계: ${statusLabel}]`,
    `[사주 등록: 나 ${f.hasSelfBirth ? "O" : "X"} / ${f.label} ${f.hasPartnerBirth ? "O" : "X"}]`,
  ];
  const rx = f.memo.prescriptions?.filter((p) => !p.resolved_at) ?? [];
  if (rx.length) lines.push(`[진행 중 처방: ${rx.map((p) => p.text).join(" / ")}]`);
  if (f.memo.skill_log?.length) {
    const recent = f.memo.skill_log.slice(-3).map((s) => `${s.skill}(${s.summary})`).join(" / ");
    lines.push(`[지난 스킬: ${recent}]`);
  }
  if (rollingSummary?.trim()) {
    lines.push(``, `## 지난 대화 요약`, rollingSummary.trim());
  }
  return "\n\n" + lines.join("\n");
}
