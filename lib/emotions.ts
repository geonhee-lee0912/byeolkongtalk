// 별콩톡 감정/고민 태그 — v3 (W1 재편: 연애 존 6 + 비연애 4)
import type { SajuProduct } from "@/lib/saju/products";

export type EmotionTag =
  // 연애 존
  | "걔 속마음이 궁금해"
  | "재회할 수 있을까"
  | "언제 연락 올까, 타이밍이 궁금해"
  | "썸, 이 관계 어떻게 될까"
  | "요즘 우리, 예전 같지 않아"
  | "새로운 인연, 언제쯤 올까"
  // 비연애
  | "진로·방향이 고민이야"
  | "어떤 선택이 맞을지 모르겠어"
  | "직장·학교에서 사람이 어려워"
  | "그냥 별콩이한테 털어놓고 싶어";

export interface EmotionOption {
  tag: EmotionTag;
  emoji: string;
  description: string;
  icon: string;
  hashtags: string[];
}

/** 연애 존 (홈 전면) */
export const LOVE_TAGS: EmotionTag[] = [
  "걔 속마음이 궁금해",
  "재회할 수 있을까",
  "언제 연락 올까, 타이밍이 궁금해",
  "썸, 이 관계 어떻게 될까",
  "요즘 우리, 예전 같지 않아",
  "새로운 인연, 언제쯤 올까",
];

/** 비연애 (홈 하단) */
export const OTHER_TAGS: EmotionTag[] = [
  "진로·방향이 고민이야",
  "어떤 선택이 맞을지 모르겠어",
  "직장·학교에서 사람이 어려워",
  "그냥 별콩이한테 털어놓고 싶어",
];

export const EMOTION_OPTIONS: EmotionOption[] = [
  {
    tag: "걔 속마음이 궁금해",
    emoji: "💭",
    description: "그 사람의 진짜 마음이 궁금할 때",
    icon: "/class01.png",
    hashtags: ["속마음", "상대마음", "짝사랑", "진심"],
  },
  {
    tag: "재회할 수 있을까",
    emoji: "🥀",
    description: "다시 이어질 가능성이 궁금할 때",
    icon: "/class02.png",
    hashtags: ["재회", "이별", "전연인", "미련"],
  },
  {
    tag: "언제 연락 올까, 타이밍이 궁금해",
    emoji: "📱",
    description: "연락을 기다리는 마음이 초조할 때",
    icon: "/class03.png",
    hashtags: ["연락", "타이밍", "기다림", "먼저연락"],
  },
  {
    tag: "썸, 이 관계 어떻게 될까",
    emoji: "💕",
    description: "시작될 듯 말 듯한 사이일 때",
    icon: "/class04.png",
    hashtags: ["썸", "밀당", "관계방향", "새인연"],
  },
  {
    tag: "요즘 우리, 예전 같지 않아",
    emoji: "🌧️",
    description: "연애 중 고민이 마음에 남을 때",
    icon: "/class05.png",
    hashtags: ["권태", "연애중", "갈등", "식은마음"],
  },
  {
    tag: "새로운 인연, 언제쯤 올까",
    emoji: "🌱",
    description: "다가올 인연이 궁금할 때",
    icon: "/class06.png",
    hashtags: ["새인연", "솔로", "연애운", "준비"],
  },
  {
    tag: "진로·방향이 고민이야",
    emoji: "🧭",
    description: "앞으로의 방향이 고민될 때",
    icon: "/class07.png",
    hashtags: ["진로", "방향", "일", "미래"],
  },
  {
    tag: "어떤 선택이 맞을지 모르겠어",
    emoji: "⚖️",
    description: "선택지 사이에서 고민될 때",
    icon: "/class08.png",
    hashtags: ["선택", "결정", "갈림길", "고민"],
  },
  {
    tag: "직장·학교에서 사람이 어려워",
    emoji: "🏢",
    description: "직장·학교 사람 관계가 어려울 때",
    icon: "/class09.png",
    hashtags: ["직장동료", "상사", "친구", "인간관계"],
  },
  {
    tag: "그냥 별콩이한테 털어놓고 싶어",
    emoji: "💬",
    description: "마음을 편하게 이야기하고 싶을 때",
    icon: "/class10.png",
    hashtags: ["자유상담", "마음정리", "위로", "털어놓기"],
  },
];

/** 인라인 그라데이션 */
export const EMOTION_GRADIENTS: Record<EmotionTag, string> = {
  "걔 속마음이 궁금해":           "linear-gradient(135deg, #FCE7EE 0%, #F8C9D6 100%)",
  "재회할 수 있을까":             "linear-gradient(135deg, #EEE0FB 0%, #D4B6F0 100%)",
  "언제 연락 올까, 타이밍이 궁금해": "linear-gradient(135deg, #FFEFE3 0%, #FACDB4 100%)",
  "썸, 이 관계 어떻게 될까":       "linear-gradient(135deg, #FBEAF0 0%, #F4C0D1 100%)",
  "요즘 우리, 예전 같지 않아":     "linear-gradient(135deg, #E3F1FA 0%, #C2DEF5 100%)",
  "새로운 인연, 언제쯤 올까":      "linear-gradient(135deg, #E4F6E8 0%, #C2E8CC 100%)",
  "진로·방향이 고민이야":          "linear-gradient(135deg, #FFEAC4 0%, #F3C25E 100%)",
  "어떤 선택이 맞을지 모르겠어":    "linear-gradient(135deg, #E4E6FA 0%, #C3C8F0 100%)",
  "직장·학교에서 사람이 어려워":    "linear-gradient(135deg, #DEF1EC 0%, #BAE0D4 100%)",
  "그냥 별콩이한테 털어놓고 싶어":  "linear-gradient(135deg, #EFEAF6 0%, #DACFEC 100%)",
};

/** 구 태그(v2) → 새 태그. 과거 reading 렌더 + 구 딥링크 하위호환용. */
export const LEGACY_EMOTION_TAGS: Record<string, EmotionTag> = {
  "그 사람 마음이 궁금해": "걔 속마음이 궁금해",
  "관계 때문에 마음이 쓰여": "직장·학교에서 사람이 어려워",
  "내 앞날의 방향이 궁금해": "진로·방향이 고민이야",
  "요즘 하는 일이 버거워": "진로·방향이 고민이야",
  "요즘 내 흐름이 궁금해": "그냥 별콩이한테 털어놓고 싶어",
  "좋은 신호인지 확인하고 싶어": "그냥 별콩이한테 털어놓고 싶어",
  "새로운 시작이 기대돼": "어떤 선택이 맞을지 모르겠어",
  "잘하고 있는지 듣고 싶어": "그냥 별콩이한테 털어놓고 싶어",
};

/** 임의 문자열(구 태그 포함)을 현행 태그로 정규화. 못 찾으면 null. */
export function normalizeEmotionTag(raw: string | null | undefined): EmotionTag | null {
  if (!raw) return null;
  if (EMOTION_OPTIONS.some((o) => o.tag === raw)) return raw as EmotionTag;
  return LEGACY_EMOTION_TAGS[raw] ?? null;
}

export type ConsultationType = "saju" | "tarot";

/** /concern → /tarot 분기용 sessionStorage payload (사주 상담 폐쇄 후에도 타입은 유지) */
export interface PendingConsultation {
  emotion: EmotionTag;
  concern: string;
  type?: ConsultationType;
  sajuProduct?: SajuProduct;
}

export const PENDING_KEY = "byeolkong:pending_consultation";
