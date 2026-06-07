// 결제 후 리포트 생성 중 이탈(뒤로가기) 복구용 마커.
// 생성 시작 직전 localStorage 에 기록 → 응답 받으면 삭제.
// 이탈해서 응답을 못 받은 경우에만 마커가 남아, 랜딩에서 복구 배너로 안내.

import type { FortuneType } from "./types";

const KEY = "byeolkong:pending_fortune";
const MAX_AGE_MS = 10 * 60 * 1000; // 10분 지난 마커는 무효

export interface PendingFortune {
  type: FortuneType;
  /** 생성 시작 시각(ISO) — 이 시각 이후 만들어진 리딩만 복구 대상 */
  after: string;
}

export function setPendingFortune(type: FortuneType): void {
  try {
    const v: PendingFortune = { type, after: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export function clearPendingFortune(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** 유효한(10분 이내) 마커면 반환, 아니면 정리 후 null. */
export function readPendingFortune(): PendingFortune | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as PendingFortune;
    if (!v?.type || !v?.after) {
      clearPendingFortune();
      return null;
    }
    if (Date.now() - new Date(v.after).getTime() > MAX_AGE_MS) {
      clearPendingFortune();
      return null;
    }
    return v;
  } catch {
    clearPendingFortune();
    return null;
  }
}
