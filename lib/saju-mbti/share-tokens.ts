import { ALL_CODES } from "./codes.ts";

export const BANDS = ["천명", "절충", "거스름"] as const;
export const ELS = ["목", "화", "토", "금", "수"] as const;
export type Band = (typeof BANDS)[number];
export type El = (typeof ELS)[number];

export interface ResultTokens {
  paljaCode: string;
  selfCode: string;
  band: Band;
  element: El;
}

// 인덱스 인코딩 — 비-PII·짧음·한글 URL 회피. 입력은 실제 계산값(항상 유효) 가정.
export function encodeResult(r: ResultTokens): string {
  return [
    ALL_CODES.indexOf(r.paljaCode),
    ALL_CODES.indexOf(r.selfCode),
    BANDS.indexOf(r.band),
    ELS.indexOf(r.element),
  ].join(".");
}

export function decodeResult(token: string | null | undefined): ResultTokens | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [pi, si, bi, ei] = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : -1));
  if (pi < 0 || pi > 15 || si < 0 || si > 15 || bi < 0 || bi > 2 || ei < 0 || ei > 4) return null;
  return { paljaCode: ALL_CODES[pi], selfCode: ALL_CODES[si], band: BANDS[bi], element: ELS[ei] };
}
