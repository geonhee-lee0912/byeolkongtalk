// 별자리 전용 표시 상수. 발광 젬톤 팔레트(밤하늘 위 파스텔은 칙칙해 기각, 스펙 §3).
// ⚠️ lib/saju/elements.ts 의 ELEMENT_COLORS(밝은 카드 UI용)와 별개 — 정본 통일은 열린 결정(스펙 §11).
// 모든 접근자는 방어적: enum 밖 값이 와도 폴백 반환(raw 인덱싱 크래시 금지).
import type { FiveElement } from "@/lib/saju/elements";

export const STAR_ELEMENT_COLORS: Record<FiveElement, string> = {
  목: "#4FD6B8",
  화: "#FF8A6B",
  토: "#FBC94D",
  금: "#EDE6D6",
  수: "#8AB4F8",
};
const ELEMENT_FALLBACK = "#9F8AD0"; // lilac-deep

export function starColor(element: string): string {
  return (STAR_ELEMENT_COLORS as Record<string, string>)[element] ?? ELEMENT_FALLBACK;
}

// 오행 관계(나 기준) 최소 카피 — 1:1 뷰 한 줄. 풀 카피 엔진(십신×관계분류)은 P3-3.
// 별콩 톤: 단정적 예언 금지 · 흐름/가능성 · 불안 자극 금지.
export const ELEMENT_RELATION_LABEL: Record<string, string> = {
  비화: "나란히 선 비슷한 결",
  생아: "나를 북돋아 주는 기운",
  아생: "내가 힘을 실어 주는 사이",
  극아: "나를 팽팽하게 다잡는 기운",
  아극: "내가 이끌어 가는 흐름",
};

export function elementRelationLabel(rel: string): string {
  return ELEMENT_RELATION_LABEL[rel] ?? "이어져 있는 사이";
}

export const RELATION_TYPE_LABEL: Record<string, string> = {
  friend: "친구",
  lover: "연인",
  acquaintance: "지인",
  senior: "윗사람",
};

export function relationTypeLabel(t: string): string {
  return RELATION_TYPE_LABEL[t] ?? "인연";
}

// 받침 유무로 주격 조사 이/가 선택. 한글 완성형만; 그 외(영문·기호 등)는 '가' 기본.
export function subjectParticle(word: string): "이" | "가" {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return "가"; // 한글 완성형 밖
  return (code - 0xac00) % 28 === 0 ? "가" : "이"; // 받침 없음 → 가
}
