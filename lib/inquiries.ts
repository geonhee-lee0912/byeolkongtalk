// lib/inquiries.ts — 고객센터 문의 카테고리 상수 + 타입 (사용자/어드민 공용)

export const INQUIRY_CATEGORIES = {
  bug: "버그 신고",
  refund: "환불·결제",
  suggestion: "제안·건의",
  usage: "이용 문의",
  etc: "기타",
} as const;

export type InquiryCategory = keyof typeof INQUIRY_CATEGORIES;

export function isInquiryCategory(v: unknown): v is InquiryCategory {
  return typeof v === "string" && v in INQUIRY_CATEGORIES;
}

// 입력 길이 제한 (클라이언트/서버 공용)
export const INQUIRY_TITLE_MAX = 80;
export const INQUIRY_BODY_MIN = 5;
export const INQUIRY_BODY_MAX = 2000;
