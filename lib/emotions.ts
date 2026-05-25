// 별콩톡 감정 카테고리 — v1 워딩 그대로, "오늘의 카드"는 v2 에서 제외

export type EmotionTag =
  | "연애 고민"
  | "진로·미래"
  | "사람·관계"
  | "돈 걱정"
  | "불안하고 지쳐"
  | "결정을 못 하겠어";

export interface EmotionOption {
  tag: EmotionTag;
  emoji: string;
  description: string;
}

export const EMOTION_OPTIONS: EmotionOption[] = [
  { tag: "연애 고민", emoji: "💕", description: "자꾸 그 사람 생각이 나지?" },
  { tag: "진로·미래", emoji: "🧭", description: "이대로 괜찮은 건지 불안하지?" },
  { tag: "사람·관계", emoji: "👥", description: "말 못 할 사람 때문에 힘들지?" },
  { tag: "돈 걱정", emoji: "💰", description: "돈 생각하면 한숨 나오지?" },
  { tag: "불안하고 지쳐", emoji: "🌧️", description: "괜찮은 척 하느라 힘들었지?" },
  { tag: "결정을 못 하겠어", emoji: "⚖️", description: "어느 쪽이든 후회할 것 같지?" },
];

export const HIGHLIGHT_TAGS: EmotionTag[] = ["연애 고민", "불안하고 지쳐"];
export const NORMAL_TAGS: EmotionTag[] = [
  "진로·미래",
  "사람·관계",
  "돈 걱정",
  "결정을 못 하겠어",
];

/** 인라인 그라데이션 (Tailwind v4 @theme 기본 팔레트 의존 회피) */
export const EMOTION_GRADIENTS: Record<EmotionTag, string> = {
  "연애 고민":       "linear-gradient(135deg, #FCE7EE 0%, #F8D4DC 100%)",
  "불안하고 지쳐":   "linear-gradient(135deg, #E8DEF5 0%, #D4C7EE 100%)",
  "진로·미래":       "linear-gradient(135deg, #FFF4DC 0%, #F2D78A 100%)",
  "사람·관계":       "linear-gradient(135deg, #E3F1FA 0%, #C7E2F5 100%)",
  "돈 걱정":         "linear-gradient(135deg, #E5F5EA 0%, #C9EAD4 100%)",
  "결정을 못 하겠어": "linear-gradient(135deg, #ECE4F8 0%, #D4C7EE 100%)",
};

export type ConsultationType = "saju" | "tarot";

/** /concern → /saju 또는 /tarot 분기용 sessionStorage payload */
export interface PendingConsultation {
  emotion: EmotionTag;
  concern: string;
  type: ConsultationType;
}

export const PENDING_KEY = "byeolkong:pending_consultation";
