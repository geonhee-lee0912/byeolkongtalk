// lib/saju/elements.ts — 오행 타입 + 색상 (SajuBoard / 마이페이지 공용). 금=흰색.
export type FiveElement = "목" | "화" | "토" | "금" | "수";

// 별콩이 톤 (cream/lilac/gold 와 어울리는 부드러운 톤). 전통 채도 낮춤.
export const ELEMENT_COLORS: Record<FiveElement, { bg: string; text: string; bar: string }> = {
  목: { bg: "#D8E8C9", text: "#3D5C2B", bar: "#A8C88A" },
  화: { bg: "#F4CFC4", text: "#7C3527", bar: "#E89B8C" },
  토: { bg: "#F4E0B8", text: "#6E4F1C", bar: "#E8C26A" },
  금: { bg: "#FFFFFF", text: "#4A4A52", bar: "#B0B0B8" },
  수: { bg: "#C8CFE5", text: "#27325A", bar: "#7A85B0" },
};
