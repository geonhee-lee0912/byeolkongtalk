// 별콩톡 감정/고민 카테고리 — v2 10종 리뉴얼 (이미지 아이콘 + 해시태그)

export type EmotionTag =
  | "그 사람 마음이 궁금해"
  | "관계 때문에 마음이 쓰여"
  | "내 앞날의 방향이 궁금해"
  | "요즘 하는 일이 버거워"
  | "어떤 선택이 맞을지 모르겠어"
  | "요즘 내 흐름이 궁금해"
  | "좋은 신호인지 확인하고 싶어"
  | "새로운 시작이 기대돼"
  | "잘하고 있는지 듣고 싶어"
  | "그냥 별콩이한테 털어놓고 싶어";

export interface EmotionOption {
  tag: EmotionTag;
  emoji: string;
  description: string;
  /** public 폴더의 아이콘 이미지 (홈 카드에 사용) */
  icon: string;
  hashtags: string[];
}

export const EMOTION_OPTIONS: EmotionOption[] = [
  {
    tag: "그 사람 마음이 궁금해",
    emoji: "💕",
    description: "연애, 썸, 이별처럼 자꾸 마음이 향하는 사람이 있을 때",
    icon: "/class01.png",
    hashtags: ["연애", "썸", "재회", "상대마음"],
  },
  {
    tag: "관계 때문에 마음이 쓰여",
    emoji: "👥",
    description: "친구, 가족, 동료와의 일이 마음에 남아 있을 때",
    icon: "/class02.png",
    hashtags: ["인간관계", "가족", "친구", "서운함"],
  },
  {
    tag: "내 앞날의 방향이 궁금해",
    emoji: "🧭",
    description: "진로와 미래, 지금 가는 길이 나에게 맞는지 알고 싶을 때",
    icon: "/class03.png",
    hashtags: ["진로", "미래", "방향", "인생고민"],
  },
  {
    tag: "요즘 하는 일이 버거워",
    emoji: "💼",
    description: "회사, 공부, 해야 할 일들이 무겁고 지치게 느껴질 때",
    icon: "/class04.png",
    hashtags: ["일", "공부", "직장", "번아웃"],
  },
  {
    tag: "어떤 선택이 맞을지 모르겠어",
    emoji: "⚖️",
    description: "여러 선택지 사이에서 고민되거나, 타이밍이 헷갈릴 때",
    icon: "/class05.png",
    hashtags: ["선택", "결정", "타이밍", "고민"],
  },
  {
    tag: "요즘 내 흐름이 궁금해",
    emoji: "🔮",
    description: "지금 나의 운, 기회, 가까운 미래가 궁금할 때",
    icon: "/class06.png",
    hashtags: ["운세", "흐름", "기회", "가까운미래"],
  },
  {
    tag: "좋은 신호인지 확인하고 싶어",
    emoji: "✨",
    description: "요즘 생긴 변화나 관계가 좋은 방향일지 궁금할 때",
    icon: "/class07.png",
    hashtags: ["좋은신호", "확인", "기대", "관계흐름"],
  },
  {
    tag: "새로운 시작이 기대돼",
    emoji: "🌱",
    description: "새 인연, 새 일, 새 선택 앞에서 앞으로의 흐름을 보고 싶을 때",
    icon: "/class08.png",
    hashtags: ["새출발", "설렘", "변화", "시작"],
  },
  {
    tag: "잘하고 있는지 듣고 싶어",
    emoji: "🌟",
    description: "내 선택이 괜찮은 방향인지 확인하고 싶을 때",
    icon: "/class09.png",
    hashtags: ["응원", "확신", "자기확인", "위로"],
  },
  {
    tag: "그냥 별콩이한테 털어놓고 싶어",
    emoji: "💬",
    description: "뭐라고 말할지 몰라도, 마음을 편하게 이야기하고 싶을 때",
    icon: "/class10.png",
    hashtags: ["자유상담", "마음정리", "그냥대화", "털어놓기"],
  },
];

// 1·5·9번 → 인기 고민, 나머지 → 다른 고민
export const HIGHLIGHT_TAGS: EmotionTag[] = [
  "그 사람 마음이 궁금해",
  "어떤 선택이 맞을지 모르겠어",
  "잘하고 있는지 듣고 싶어",
];
export const NORMAL_TAGS: EmotionTag[] = [
  "관계 때문에 마음이 쓰여",
  "내 앞날의 방향이 궁금해",
  "요즘 하는 일이 버거워",
  "요즘 내 흐름이 궁금해",
  "좋은 신호인지 확인하고 싶어",
  "새로운 시작이 기대돼",
  "그냥 별콩이한테 털어놓고 싶어",
];

/** 인라인 그라데이션 (Tailwind v4 @theme 기본 팔레트 의존 회피) */
export const EMOTION_GRADIENTS: Record<EmotionTag, string> = {
  // 연애 — 로즈 핑크
  "그 사람 마음이 궁금해":     "linear-gradient(135deg, #FCE7EE 0%, #F8C9D6 100%)",
  // 인간관계 — 스카이 블루
  "관계 때문에 마음이 쓰여":   "linear-gradient(135deg, #E3F1FA 0%, #C2DEF5 100%)",
  // 진로·방향 — 앰버 골드
  "내 앞날의 방향이 궁금해":   "linear-gradient(135deg, #FFEAC4 0%, #F3C25E 100%)",
  // 번아웃 — 차분한 민트 틸
  "요즘 하는 일이 버거워":     "linear-gradient(135deg, #DEF1EC 0%, #BAE0D4 100%)",
  // 선택·결정 — 페리윙클 인디고
  "어떤 선택이 맞을지 모르겠어": "linear-gradient(135deg, #E4E6FA 0%, #C3C8F0 100%)",
  // 운세·흐름 — 미스틱 바이올렛
  "요즘 내 흐름이 궁금해":     "linear-gradient(135deg, #EEE0FB 0%, #D4B6F0 100%)",
  // 좋은 신호 — 코랄 피치
  "좋은 신호인지 확인하고 싶어": "linear-gradient(135deg, #FFEFE3 0%, #FACDB4 100%)",
  // 새 시작 — 프레시 그린
  "새로운 시작이 기대돼":      "linear-gradient(135deg, #E4F6E8 0%, #C2E8CC 100%)",
  // 응원·확신 — 써니 레몬
  "잘하고 있는지 듣고 싶어":   "linear-gradient(135deg, #FFF8DD 0%, #FBE89E 100%)",
  // 자유상담 — 소프트 라일락 그레이
  "그냥 별콩이한테 털어놓고 싶어": "linear-gradient(135deg, #EFEAF6 0%, #DACFEC 100%)",
};

export type ConsultationType = "saju" | "tarot";

/** /concern → /saju 또는 /tarot 분기용 sessionStorage payload */
export interface PendingConsultation {
  emotion: EmotionTag;
  concern: string;
  type?: ConsultationType;
}

export const PENDING_KEY = "byeolkong:pending_consultation";
