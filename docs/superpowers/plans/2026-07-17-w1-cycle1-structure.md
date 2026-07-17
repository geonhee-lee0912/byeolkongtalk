# W1 사이클 1 — 구조 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고민톡=타로 전용(연애 존 6태그+비연애 4태그, 신설 스프레드 10종, 태그당 5개 큐레이션) / 사주=운세 리포트 진열대로 구조 전환 + 광고 랜딩 variant 2종.

**Architecture:** 스프레드·태그의 단일 진실 원천(`lib/tarot/spreads.ts`, `lib/emotions.ts`)을 v2로 교체하면 서버 검증(`VALID_SPREADS = Object.keys(SPREAD_INFO)`)과 가격이 자동 추종한다. UI는 그 위에서 태그 그리드/큐레이션/진열만 갈아끼운다. DB 마이그레이션 불필요(emotion_tag VARCHAR(40), spread_type VARCHAR(20) — 새 키 전부 수용).

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4. 검증: `npm run build`(타입체크 겸용) + `npm run qa`(별콩이 하네스) + dev 브라우저 확인.

**Spec:** `docs/superpowers/specs/2026-07-17-w1-love-restructure-w6-ads-design.md`

⚠️ **배포 정책: 이 플랜의 모든 커밋은 dev 브랜치 전용. prod(main) 머지는 사이클 1~3 전체 QA 후 1회 일괄 — 이 플랜 범위 밖.**

**후속 플랜**: 사이클 2(우리 사이)는 이 플랜 dev 안착 후 별도 작성. 사이클 3(QA·prod·광고)도 별도.

---

## 사전 지식 (실행자 필독)

- 고민톡 흐름: 홈(태그) → `/concern`(고민 입력) → `/tarot`(스프레드 선택) → `/tarot/draw`(카드 뽑기+별 확인) → `/tarot/reading`(SSE 채팅). sessionStorage 계약: `byeolkong:pending_consultation`(PENDING_KEY) → `TAROT_SPREAD_KEY` → `TAROT_DRAW_KEY`.
- 서버는 `SPREAD_INFO`에서 spreadType 검증+가격을 읽음 ([app/api/consultations/tarot/route.ts:23](../../../app/api/consultations/tarot/route.ts)). 새 스프레드는 SPREAD_INFO에 넣는 순간 결제·검증이 작동.
- `spread_category`는 reading에 저장되어 채팅 프롬프트·라벨에 쓰임 — 카테고리 체계(love/interpersonal/career/decision/mental/worry/default)는 유지하고 태그→카테고리 매핑만 갱신.
- 기존 태그 문자열은 DB에 남아 있음(과거 readings). **기존 문자열을 참조하는 코드는 폴백을 유지**해야 함 (렌더 시 raw 문자열 표시로 충분).
- 페르소나 수정 후 dev 서버 재시작 필수 (모듈 캐시).

---

### Task 1: `lib/emotions.ts` v2 — 태그 체계 교체

**Files:**
- Modify: `lib/emotions.ts` (전면 재작성)
- 참조: `lib/saju/products.ts` (SajuProduct import가 깨지지 않게 PendingConsultation 타입 유지)

- [ ] **Step 1: 새 태그 상수로 재작성**

`lib/emotions.ts`를 아래로 교체 (기존 파일의 주석 스타일 유지). 핵심: `EmotionTag` 10종 신규, `LOVE_TAGS`/`OTHER_TAGS` 분리, `LEGACY_EMOTION_TAGS`(구 태그 → 새 태그 매핑, 과거 reading 렌더·딥링크 하위호환), 그라데이션·해시태그 신규.

```typescript
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
    description: "짝사랑이든 연인이든 전 연인이든, 그 사람 마음이 궁금할 때",
    icon: "/class01.png",
    hashtags: ["속마음", "상대마음", "짝사랑", "진심"],
  },
  {
    tag: "재회할 수 있을까",
    emoji: "🥀",
    description: "헤어진 그 사람과의 남은 결, 다시 이어질 가능성이 궁금할 때",
    icon: "/class02.png",
    hashtags: ["재회", "이별", "전연인", "미련"],
  },
  {
    tag: "언제 연락 올까, 타이밍이 궁금해",
    emoji: "📱",
    description: "연락을 기다리거나, 먼저 연락해도 될지 타이밍이 고민될 때",
    icon: "/class03.png",
    hashtags: ["연락", "타이밍", "기다림", "먼저연락"],
  },
  {
    tag: "썸, 이 관계 어떻게 될까",
    emoji: "💕",
    description: "시작될 듯 말 듯한 사이, 이 관계의 방향이 궁금할 때",
    icon: "/class04.png",
    hashtags: ["썸", "밀당", "관계방향", "새인연"],
  },
  {
    tag: "요즘 우리, 예전 같지 않아",
    emoji: "🌧️",
    description: "마음이 식은 건지, 싸움이 잦은 건지 — 연애 중 고민이 있을 때",
    icon: "/class05.png",
    hashtags: ["권태", "연애중", "갈등", "식은마음"],
  },
  {
    tag: "새로운 인연, 언제쯤 올까",
    emoji: "🌱",
    description: "지금은 혼자지만, 다가올 인연과 나의 준비가 궁금할 때",
    icon: "/class06.png",
    hashtags: ["새인연", "솔로", "연애운", "준비"],
  },
  {
    tag: "진로·방향이 고민이야",
    emoji: "🧭",
    description: "진로, 일, 앞으로의 방향이 나에게 맞는지 알고 싶을 때",
    icon: "/class07.png",
    hashtags: ["진로", "방향", "일", "미래"],
  },
  {
    tag: "어떤 선택이 맞을지 모르겠어",
    emoji: "⚖️",
    description: "여러 선택지 사이에서 고민되거나, 타이밍이 헷갈릴 때",
    icon: "/class08.png",
    hashtags: ["선택", "결정", "갈림길", "고민"],
  },
  {
    tag: "직장·학교에서 사람이 어려워",
    emoji: "🏢",
    description: "회사·학교에서 마주치는 사람들과의 관계가 마음에 남을 때",
    icon: "/class09.png",
    hashtags: ["직장동료", "상사", "친구", "인간관계"],
  },
  {
    tag: "그냥 별콩이한테 털어놓고 싶어",
    emoji: "💬",
    description: "뭐라고 말할지 몰라도, 마음을 편하게 이야기하고 싶을 때",
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
```

주의: 기존 `HIGHLIGHT_TAGS`/`NORMAL_TAGS`를 import하는 파일이 있으면 `LOVE_TAGS`/`OTHER_TAGS`로 치환한다 (`grep -rn "HIGHLIGHT_TAGS\|NORMAL_TAGS" app components lib`로 전수 확인).

- [ ] **Step 2: 빌드로 파급 지점 확인**

Run: `npm run build`
Expected: `EMOTION_TO_CATEGORY`(spreads.ts), 홈, /concern, /select, /start 등에서 타입 에러 목록이 나옴 — 이 목록이 Task 2~8의 작업 대상 체크리스트. 에러 파일 목록을 기록해둔다.

- [ ] **Step 3: 커밋 (빌드 깨진 상태로 커밋 금지 — Task 2와 함께 커밋해도 됨. 단독 커밋하려면 Task 2 완료 후)**

---

### Task 2: `lib/tarot/spreads.ts` v2 — 신설 스프레드 10종 + 태그 큐레이션

**Files:**
- Modify: `lib/tarot/spreads.ts` (전면 재작성)

- [ ] **Step 1: 재작성**

핵심 변경: ① `SpreadType`에 10종 추가 (전부 DB `spread_type VARCHAR(20)` 이내) ② `SPREAD_INFO` 가격 사다리 ③ `TAG_SPREADS`(태그당 5개 큐레이션 — `getSpreadOptions(category)` 대체) ④ 포지션 라벨: 기존 카테고리 키 유지 + `TAG_LABEL_OVERRIDES`(태그별 라벨 교체) ⑤ 기존 4종·기존 함수 시그니처는 유지(호출부 무사).

```typescript
import {
  type EmotionTag,
  normalizeEmotionTag,
} from "@/lib/emotions";

// ===== Spread Types =====

export type SpreadType =
  | "one_card"
  | "two_card"
  | "three_card"
  | "relationship_5"
  // W1 신설 10종 (DB spread_type VARCHAR(20) 이내)
  | "deep_feelings_5"
  | "reunion_5"
  | "reunion_deep_7"
  | "potential_7"
  | "checkin_6"
  | "stay_or_go_6"
  | "new_love_5"
  | "readiness_6"
  | "healing_6"
  | "chakra_7";

export type SpreadCategory =
  | "love"
  | "interpersonal"
  | "career"
  | "decision"
  | "mental"
  | "worry"
  | "default";

export interface SpreadInfo {
  type: SpreadType;
  cardCount: number;
  starCost: number;
  label: string;
  tagline: string;
  description: string;
  accent: string;
}

export const SPREAD_INFO: Record<SpreadType, SpreadInfo> = {
  one_card: {
    type: "one_card", cardCount: 1, starCost: 10,
    label: "원카드", tagline: "한 장으로 가볍게",
    description: "빠르게 한 줄, 지금 고민에 대한 답이 필요할 때",
    accent: "#6B8DD6",
  },
  two_card: {
    type: "two_card", cardCount: 2, starCost: 15,
    label: "투카드", tagline: "두 장으로 균형있게",
    description: "너의 상황과 그에 대한 조언, 양쪽을 같이 봐줄게",
    accent: "#65B28F",
  },
  three_card: {
    type: "three_card", cardCount: 3, starCost: 25,
    label: "쓰리카드", tagline: "세 장으로 입체적으로",
    description: "세 장을 이어서 흐름까지 짚어줄게",
    accent: "#E0976B",
  },
  relationship_5: {
    type: "relationship_5", cardCount: 5, starCost: 40,
    label: "관계 스프레드", tagline: "다섯 장으로 두 사람을",
    description: "너와 상대방의 관계, 서로의 기대와 앞으로의 방향까지",
    accent: "#D4708F",
  },
  deep_feelings_5: {
    type: "deep_feelings_5", cardCount: 5, starCost: 40,
    label: "속마음 심층", tagline: "그 사람만 다섯 장으로",
    description: "겉모습 뒤의 진짜 속마음과 망설임, 다가올 태도까지 깊이",
    accent: "#C25C8A",
  },
  reunion_5: {
    type: "reunion_5", cardCount: 5, starCost: 40,
    label: "재회 스프레드", tagline: "다시 이어질 결을",
    description: "두 사람을 막고 있는 것과 다시 이어질 가능성을 봐줄게",
    accent: "#9F8AD0",
  },
  reunion_deep_7: {
    type: "reunion_deep_7", cardCount: 7, starCost: 55,
    label: "재회 심층", tagline: "일곱 장으로 정직하게",
    description: "서로의 몫과 회복의 조건, 재회가 너에게 갖는 의미까지",
    accent: "#7E6BB5",
  },
  potential_7: {
    type: "potential_7", cardCount: 7, starCost: 55,
    label: "가능성 스프레드", tagline: "장기 잠재력까지",
    description: "지금 상황부터 다음 단계, 멀리의 잠재력까지 일곱 장으로",
    accent: "#4E8FB8",
  },
  checkin_6: {
    type: "checkin_6", cardCount: 6, starCost: 45,
    label: "관계 체크인", tagline: "서로의 필요를 나란히",
    description: "두 사람의 상태와 서로에게 필요한 것을 대칭으로 점검해",
    accent: "#5CA88F",
  },
  stay_or_go_6: {
    type: "stay_or_go_6", cardCount: 6, starCost: 45,
    label: "계속? 그만?", tagline: "두 갈래를 나란히",
    description: "머무를 이유와 떠날 이유, 각 선택 뒤의 너를 비교해줄게",
    accent: "#C98A4B",
  },
  new_love_5: {
    type: "new_love_5", cardCount: 5, starCost: 40,
    label: "새 인연 찾기", tagline: "다가올 인연의 결",
    description: "새 인연의 특성과 만나게 될 환경, 관계의 방향까지",
    accent: "#6FAE6F",
  },
  readiness_6: {
    type: "readiness_6", cardCount: 6, starCost: 45,
    label: "새 사랑 준비도", tagline: "나부터 들여다보기",
    description: "지난 연애의 교훈과 방해 요소, 마음·생각·삶의 준비 상태",
    accent: "#8FA85C",
  },
  healing_6: {
    type: "healing_6", cardCount: 6, starCost: 45,
    label: "마음 치유", tagline: "남은 상처 돌보기",
    description: "반복되는 패턴과 남은 상처, 놓아주기 위한 방향을 짚어줄게",
    accent: "#B58AA5",
  },
  chakra_7: {
    type: "chakra_7", cardCount: 7, starCost: 55,
    label: "마음 차크라", tagline: "나를 일곱 층으로",
    description: "안정감부터 삶의 의미까지, 지금의 나를 일곱 층위로 봐줄게",
    accent: "#7D74C9",
  },
};

// ===== 태그 → 카테고리 (spread_category 저장·라벨 폴백용) =====

export const EMOTION_TO_CATEGORY: Record<EmotionTag, SpreadCategory> = {
  "걔 속마음이 궁금해": "love",
  "재회할 수 있을까": "love",
  "언제 연락 올까, 타이밍이 궁금해": "love",
  "썸, 이 관계 어떻게 될까": "love",
  "요즘 우리, 예전 같지 않아": "love",
  "새로운 인연, 언제쯤 올까": "love",
  "진로·방향이 고민이야": "career",
  "어떤 선택이 맞을지 모르겠어": "decision",
  "직장·학교에서 사람이 어려워": "interpersonal",
  "그냥 별콩이한테 털어놓고 싶어": "mental",
};

// ===== 태그당 5개 큐레이션 (스펙 §3 매트릭스) =====

export const TAG_SPREADS: Record<EmotionTag, SpreadType[]> = {
  "걔 속마음이 궁금해":
    ["one_card", "two_card", "three_card", "deep_feelings_5", "potential_7"],
  "재회할 수 있을까":
    ["one_card", "two_card", "three_card", "reunion_5", "reunion_deep_7"],
  "언제 연락 올까, 타이밍이 궁금해":
    ["one_card", "two_card", "three_card", "relationship_5", "potential_7"],
  "썸, 이 관계 어떻게 될까":
    ["one_card", "two_card", "three_card", "relationship_5", "potential_7"],
  "요즘 우리, 예전 같지 않아":
    ["one_card", "two_card", "three_card", "checkin_6", "stay_or_go_6"],
  "새로운 인연, 언제쯤 올까":
    ["one_card", "two_card", "three_card", "new_love_5", "readiness_6"],
  "진로·방향이 고민이야":
    ["one_card", "two_card", "three_card", "stay_or_go_6", "potential_7"],
  "어떤 선택이 맞을지 모르겠어":
    ["one_card", "two_card", "three_card", "stay_or_go_6", "potential_7"],
  "직장·학교에서 사람이 어려워":
    ["one_card", "two_card", "three_card", "deep_feelings_5", "checkin_6"],
  "그냥 별콩이한테 털어놓고 싶어":
    ["one_card", "two_card", "three_card", "healing_6", "chakra_7"],
};

/** 태그 기반 큐레이션. 구 태그·미지의 문자열은 기본 3종 폴백. */
export function getSpreadOptionsForTag(rawTag: string): SpreadType[] {
  const tag = normalizeEmotionTag(rawTag);
  if (tag) return TAG_SPREADS[tag];
  return ["one_card", "two_card", "three_card"];
}

// ===== 포지션 라벨: 카테고리 기본 + 태그 오버라이드 =====

export const SPREAD_LABELS: Record<SpreadType, Record<string, string[]>> = {
  one_card: { default: ["질문의 답"] },
  two_card: {
    love: ["현재 상황", "상황에 대한 조언"],
    interpersonal: ["현재 관계", "관계에 대한 조언"],
    career: ["현재 상황", "상황에 대한 조언"],
    decision: ["찬성 근거", "반대 근거"],
    mental: ["의식", "무의식"],
    default: ["현재 상황", "상황에 대한 조언"],
  },
  three_card: {
    love: ["나", "상대방", "둘 사이의 에너지"],
    interpersonal: ["나", "상대", "관계의 흐름"],
    career: ["과거", "현재", "미래"],
    decision: ["선택지 A", "현재 상태", "선택지 B"],
    mental: ["마음", "몸", "영혼"],
    worry: ["상황", "장애물", "조언"],
    default: ["과거", "현재", "미래"],
  },
  relationship_5: {
    default: ["나", "상대방", "나의 기대", "상대의 기대", "관계의 방향"],
  },
  deep_feelings_5: {
    default: ["겉으로 보이는 태도", "진짜 속마음", "망설이는 이유", "나에 대한 진심", "다가올 태도"],
    interpersonal: ["겉으로 보이는 태도", "그 사람의 속마음", "거리를 두는 이유", "나에 대한 평가", "다가올 태도"],
  },
  reunion_5: {
    default: ["나의 현재", "그 사람의 현재", "막고 있는 문제", "필요한 행동", "향후 가능성"],
  },
  reunion_deep_7: {
    default: ["나의 몫", "그 사람의 몫", "나의 회복 행동", "상대의 회복 조건", "외부 요인", "회복 가능성", "재회의 의미"],
  },
  potential_7: {
    default: ["둘러싼 상황", "나", "상대방", "조언", "도전 요소", "다음 단계", "장기 잠재력"],
    career: ["둘러싼 상황", "지금의 나", "목표", "조언", "도전 요소", "다음 단계", "장기 잠재력"],
    decision: ["둘러싼 상황", "지금의 나", "기우는 선택", "조언", "도전 요소", "다음 단계", "장기 잠재력"],
  },
  checkin_6: {
    default: ["지금의 나", "지금의 상대", "둘 사이 에너지", "내가 필요한 것", "상대가 필요한 것", "나아갈 방향"],
    interpersonal: ["지금의 나", "그 사람", "둘 사이 공기", "내가 필요한 것", "그 사람의 입장", "관계의 방향"],
  },
  stay_or_go_6: {
    default: ["현재 상태", "머무를 이유", "떠날 이유", "계속일 때의 나", "떠날 때의 나", "결정의 기준"],
    career: ["현재 상태", "남을 이유", "떠날 이유", "남을 때의 나", "떠날 때의 나", "결정의 기준"],
    decision: ["현재 상태", "A를 고를 이유", "B를 고를 이유", "A 이후의 나", "B 이후의 나", "결정의 기준"],
  },
  new_love_5: {
    default: ["나의 준비 상태", "다가올 인연의 결", "만남의 환경", "관계의 성격", "관계의 방향"],
  },
  readiness_6: {
    default: ["내가 원하는 사랑", "지난 연애의 교훈", "방해하는 것", "감정의 준비", "생각의 준비", "삶의 준비"],
  },
  healing_6: {
    default: ["과거의 패턴", "남아 있는 상처", "지금의 상태", "상처가 드러나는 방식", "치유의 모습", "놓아주는 방향"],
  },
  chakra_7: {
    default: ["안정감", "욕구", "자존감", "감정", "표현", "직관", "의미"],
  },
};

/** 태그별 라벨 오버라이드 (카테고리 기본으로 부족한 경우만) */
const TAG_LABEL_OVERRIDES: Partial<
  Record<EmotionTag, Partial<Record<SpreadType, string[]>>>
> = {
  "언제 연락 올까, 타이밍이 궁금해": {
    three_card: ["지금의 흐름", "전환점", "다가올 신호"],
  },
  "재회할 수 있을까": {
    three_card: ["나", "그 사람", "남은 결"],
  },
  "새로운 인연, 언제쯤 올까": {
    three_card: ["지금의 나", "다가올 기류", "준비할 것"],
  },
};

export function getPositionLabels(
  spread: SpreadType,
  category: SpreadCategory,
  rawTag?: string | null
): string[] {
  const tag = rawTag ? normalizeEmotionTag(rawTag) : null;
  const override = tag ? TAG_LABEL_OVERRIDES[tag]?.[spread] : undefined;
  if (override) return override;
  const map = SPREAD_LABELS[spread];
  return map[category] || map.default;
}

// ===== 스프레드 설명 (선택 카드용) — 카테고리별 =====

export const SPREAD_DESCRIPTIONS: Record<
  SpreadType,
  Partial<Record<SpreadCategory, string>> & { default: string }
> = {
  one_card: {
    love: "지금 이 고민, 한 장에 담긴 힌트로 답을 찾자",
    career: "진로 고민, 한 줄 답이 필요할 때",
    decision: "지금 떠오르는 한 장이 답의 실마리가 돼",
    mental: "지친 마음에 필요한 한 장의 위로",
    interpersonal: "지금 관계에 대한 실마리를 한 장에 담아줄게",
    default: "빠르게 한 줄, 지금 고민에 대한 답이 필요할 때",
  },
  two_card: {
    love: "지금 상황과 조언, 양쪽을 같이 봐줄게",
    decision: "찬반 두 장을 나란히 놓고 들여다보자",
    mental: "의식과 무의식, 마음 두 면을 같이 볼게",
    interpersonal: "관계 상황과 풀어갈 실마리를 같이 봐줄게",
    default: "너의 상황과 그에 대한 조언, 양쪽을 같이 봐줄게",
  },
  three_card: {
    love: "너와 상대, 둘 사이의 에너지까지 깊이 봐줄게",
    career: "과거·현재·미래 흐름으로 방향을 비춰줄게",
    decision: "선택지 둘과 지금 상태를 같이 놓고 보자",
    mental: "마음·몸·영혼 세 층으로 너를 들여다볼게",
    interpersonal: "나·상대·관계 흐름을 세 장으로 풀어줄게",
    default: "세 장을 이어서 흐름까지 짚어줄게",
  },
  relationship_5: { default: "너와 상대방의 관계, 서로의 기대와 앞으로의 방향까지" },
  deep_feelings_5: {
    interpersonal: "그 사람의 속마음과 나에 대한 평가를 다섯 장으로",
    default: "그 사람 한 명을 다섯 장으로 깊이 — 겉모습 뒤의 진심까지",
  },
  reunion_5: { default: "이별의 매듭과 다시 이어질 가능성을 다섯 장으로" },
  reunion_deep_7: { default: "서로의 몫과 회복의 조건, 재회의 의미까지 정직하게" },
  potential_7: {
    career: "커리어의 다음 단계와 장기 잠재력까지 일곱 장으로",
    default: "이 관계가 어디까지 갈 수 있는지, 잠재력까지 일곱 장으로",
  },
  checkin_6: {
    interpersonal: "그 사람과의 관계를 여섯 장으로 점검해보자",
    default: "두 사람의 상태와 서로의 필요를 나란히 점검해보자",
  },
  stay_or_go_6: {
    career: "남을까 떠날까, 두 갈래 뒤의 너를 비교해줄게",
    decision: "두 선택 뒤의 너를 나란히 놓고 비교해줄게",
    default: "계속 갈지 멈출지, 두 갈래 뒤의 감정까지 비교해줄게",
  },
  new_love_5: { default: "다가올 인연의 결과 만나게 될 환경까지 다섯 장으로" },
  readiness_6: { default: "새 사랑을 시작할 준비가 됐는지, 나부터 들여다보자" },
  healing_6: { default: "반복되는 패턴과 남은 상처, 놓아주는 방향까지" },
  chakra_7: { default: "지금의 나를 일곱 층위로 — 안정감부터 삶의 의미까지" },
};

export function getSpreadDescription(
  spread: SpreadType,
  category: SpreadCategory
): string {
  const map = SPREAD_DESCRIPTIONS[spread];
  return map[category] ?? map.default;
}

// ===== Drawn Card (sessionStorage contract: /tarot/draw → /tarot/reading) =====

export interface DrawnCard {
  position: number;
  label: string;
  card_id: number;
  direction: "upright" | "reversed";
}
```

주의: 구 `getSpreadOptions(category)`는 삭제된다 — 호출부는 [app/tarot/page.tsx:61](../../../app/tarot/page.tsx)뿐인지 `grep -rn "getSpreadOptions" app components lib`로 확인하고 Task 5에서 `getSpreadOptionsForTag`로 교체.

- [ ] **Step 2: 검증 스크립트로 스프레드 무결성 확인**

Run: `node --import tsx -e "
import { SPREAD_INFO, SPREAD_LABELS, TAG_SPREADS } from './lib/tarot/spreads';
for (const [k, v] of Object.entries(SPREAD_INFO)) {
  if (k.length > 20) throw new Error(k + ' exceeds VARCHAR(20)');
  if (SPREAD_LABELS[k].default.length !== v.cardCount) throw new Error(k + ' label count mismatch');
}
for (const [tag, list] of Object.entries(TAG_SPREADS)) {
  if (list.length !== 5) throw new Error(tag + ' curation != 5');
}
console.log('spreads v2 OK');
"`
Expected: `spreads v2 OK`

- [ ] **Step 3: 빌드**

Run: `npm run build`
Expected: emotions/spreads 자체는 통과, 호출부(UI) 에러만 잔존 — Task 5~8에서 해소. 빌드가 완전히 깨져 있는 동안은 커밋을 Task 5 이후로 미루지 말고, **깨지는 호출부를 최소 수정(컴파일만 통과)** 후 커밋한다: `getSpreadOptions` 호출을 `getSpreadOptionsForTag(pending.emotion)`으로, `HIGHLIGHT_TAGS/NORMAL_TAGS`를 `LOVE_TAGS/OTHER_TAGS`로 기계 치환.

- [ ] **Step 4: 커밋**

```bash
git add lib/emotions.ts lib/tarot/spreads.ts app components
git commit -m "feat(w1): 태그 체계 v3 + 신설 스프레드 10종 데이터 레이어"
```

---

### Task 3: 채팅 수렴 임계치 + 스프레드 프롬프트 가이드

**Files:**
- Modify: `WRAP_THRESHOLDS` 정의 파일 — `grep -rn "WRAP_THRESHOLDS" lib app` 으로 위치 확인 (chat route가 import)
- Modify: 타로 프롬프트의 스프레드 가이드 — `grep -rln "relationship_5" lib data` 로 페르소나/프롬프트 내 스프레드 분기 확인

- [ ] **Step 1: WRAP_THRESHOLDS에 신설 10종 추가**

기존 4종의 값을 확인 후 카드 수 기준으로 배치 (예시 — 실제 기존 값 스케일에 맞출 것. 원칙: 카드 수가 많을수록 풀이가 길어 turn·char 임계 상향):

```typescript
// 5장 신설(deep_feelings_5, reunion_5, new_love_5) = relationship_5와 동일 값 복사
// 6장(checkin_6, stay_or_go_6, readiness_6, healing_6) = relationship_5 값 +1턴/+300자
// 7장(reunion_deep_7, potential_7, chakra_7) = relationship_5 값 +2턴/+600자
```

- [ ] **Step 2: 프롬프트 가이드 추가**

페르소나/타로 프롬프트에서 스프레드별 해석 가이드가 있는 위치에 신설 10종 각각의 "이 스프레드가 확인하려는 것" 1~2문장 가이드를 추가한다. 문서 원안(스펙 §3 포지션 정의)을 그대로 요약해 넣는다. 특히:
- `reunion_deep_7` 마지막 카드("재회의 의미")는 **재회가 유저에게 가치 있는지 정직하게 다루라**는 가이드 필수 (문서 원안의 핵심)
- `stay_or_go_6`은 "헤어져라/만나라 지시가 아니라 두 선택의 감정적 결과 비교" 가이드
- `chakra_7`·`healing_6`은 내면·치유 톤 (확답 예언 금지 원칙과 정합)

- [ ] **Step 3: 빌드 + 커밋**

```bash
npm run build
git add -A && git commit -m "feat(w1): 신설 스프레드 수렴 임계치 + 프롬프트 가이드"
```

---

### Task 4: CardDrawRitual 6·7장 레이아웃 지원

**Files:**
- Modify: `components/tarot/CardDrawRitual.tsx`
- Modify: `components/tarot/CardSpreadView.tsx` (결과 뷰도 6·7장 배치 확인)
- 호출부: `app/tarot/draw/page.tsx:102-115` (`relationshipLayout` prop)

- [ ] **Step 1: 현재 레이아웃 로직 파악**

`CardDrawRitual.tsx`를 읽고 `cardCount` 1~5 처리와 `relationshipLayout`(5장 전용 배치)을 확인한다.

- [ ] **Step 2: 6·7장 슬롯 배치 추가**

`relationshipLayout: boolean` prop을 `layout: "row" | "relationship" | "grid2" | "grid_pyramid"` 류의 확장 가능한 형태로 바꾸지 **말고** (호출부 최소 수정 원칙), cardCount 기반 분기를 내부에 추가한다:
- 6장: 2행×3열 그리드 (상단 3, 하단 3)
- 7장: 상단 3 + 중단 3 + 하단 1(중앙) — 차크라·심층용 피라미드
- 슬롯 라벨은 기존과 동일하게 각 슬롯 하단 표기, 모바일 375px 기준 카드 폭 축소 (`min-w` 계산 조정)

- [ ] **Step 3: dev 서버로 시각 확인**

Run: dev 서버에서 `/tarot` → 재회 심층(7장)·체크인(6장) 선택 → draw 화면 진입 (별 차감 전 단계까지)
Expected: 6·7 슬롯이 뭉개지지 않고 배치, 스와이프 덱으로 전부 채우기 가능

- [ ] **Step 4: 커밋**

```bash
git add components/tarot && git commit -m "feat(w1): 카드 뽑기 6·7장 레이아웃"
```

---

### Task 5: 스프레드 선택 페이지 — 태그 큐레이션 적용

**Files:**
- Modify: `app/tarot/page.tsx`

- [ ] **Step 1: 큐레이션·추천·라벨 교체**

- `getSpreadOptions(category)` → `getSpreadOptionsForTag(pending.emotion)` ([app/tarot/page.tsx:61](../../../app/tarot/page.tsx))
- `getPositionLabels(type, category)` 호출에 세 번째 인자 `pending.emotion` 추가 (Task 2 시그니처)
- `recommendSpread`(길이 홀짝 기반)를 태그 기반으로 교체:

```typescript
function recommendSpread(tag: string, concern: string): SpreadType {
  const options = getSpreadOptionsForTag(tag);
  // 특화 ①(4번째)을 기본 추천, 고민이 짧으면(30자 미만) 쓰리카드
  if (concern.trim().length < 30) return options[2];
  return options[3];
}
```

- 5개 카드가 세로로 길어지므로 가격 오름차순 정렬 유지 확인 (TAG_SPREADS 배열 순서가 곧 진열 순서)

- [ ] **Step 2: 크로스링크 카드 추가**

스프레드 목록 하단에 태그 조건부 정적 카드 (스펙 §1 교차 연결):

```tsx
{pending.emotion === "언제 연락 올까, 타이밍이 궁금해" && (
  <Link href="/fortune/good_days"
    className="flex items-center justify-between p-3.5 rounded-2xl border border-dashed border-lilac-mid/60 bg-cream/50">
    <span className="text-[12.5px] text-eye-purple">
      📅 정확한 날짜가 궁금하면 <b>사주 좋은 날 리포트</b>로
    </span>
    <span className="text-text-light text-[12px]">›</span>
  </Link>
)}
{pending.emotion === "직장·학교에서 사람이 어려워" && (
  <Link href="/fortune/compat-social" /* 동일 스타일 */>
    <span className="text-[12.5px] text-eye-purple">
      🤝 두 사람 사주로 보는 <b>인간관계 궁합</b>도 있어
    </span>
    <span className="text-text-light text-[12px]">›</span>
  </Link>
)}
```

- [ ] **Step 3: 빌드 + dev 확인 + 커밋**

Run: `npm run build` → dev에서 태그 4~5개 골라 5개 진열·가격·라벨 확인
```bash
git add app/tarot/page.tsx && git commit -m "feat(w1): 스프레드 선택 태그 큐레이션 + 크로스링크"
```

---

### Task 6: 홈 — 연애 존 전면 + 비연애 + 궁합 카드

**Files:**
- Modify: `app/page.tsx` (기존 "인기 고민/다른 고민" 2단 구조를 "연애 고민/다른 고민"으로 재편)

- [ ] **Step 1: 섹션 재구성**

- 기존 `HIGHLIGHT_TAGS` 섹션 → `LOVE_TAGS` 6개 그리드 (기존 카드 컴포넌트·그라데이션 재사용, 섹션 타이틀 "연애 고민")
- 연애 그리드 바로 아래 **궁합 크로스링크 카드** (태그 아님, `/fortune/compat` 직행):

```tsx
<Link href="/fortune/compat"
  className="block p-4 rounded-2xl border-2 border-lilac-mid/50 bg-white/80">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-[13.5px] font-bold text-eye-purple">💞 우리 궁합은 어떨까?</p>
      <p className="text-[11.5px] text-text-light mt-0.5">두 사람 생년월일로 사주 궁합 보기</p>
    </div>
    <span className="text-text-light">›</span>
  </div>
</Link>
```

- 기존 `NORMAL_TAGS` 섹션 → `OTHER_TAGS` 4개 (섹션 타이틀 "다른 고민")
- 기존 홈의 운세 진입 섹션이 있으면 유지 (사주 탭이 주 진입이지만 홈 노출 손해 없음)

- [ ] **Step 2: 태그 클릭 흐름 확인**

기존 로직(로그인 가드 → sessionStorage → /concern) 무수정 — 태그 값만 새 것.

- [ ] **Step 3: dev 확인 + 커밋**

```bash
git add app/page.tsx && git commit -m "feat(w1): 홈 연애 존 전면 + 궁합 카드"
```

---

### Task 7: /concern — 사주/타로 picker 제거 (타로 직행) + 태그 전환

**Files:**
- Modify: `app/concern/page.tsx`
- Modify: `app/select/page.tsx` → 리다이렉트 스텁으로 교체
- 확인: `grep -rn '"/select"' app components` (draw 페이지 onBack 등 참조 수정)

- [ ] **Step 1: /concern에서 방법 선택 제거**

- 사주/타로 picker UI 삭제, 제출 시 `type: "tarot"` 고정으로 `PENDING_KEY` 저장 → `router.push("/tarot")`
- 상단 감정 컨텍스트 칩을 **탭하면 태그 변경 가능**하게: 칩 클릭 → 인라인 태그 시트(연애 6 + 비연애 4, EMOTION_OPTIONS 재사용) → 선택 시 pending.emotion 교체 (광고 랜딩 유입 유저의 갈아타기 경로 — 스펙 §8 랜딩)

- [ ] **Step 2: /select 폐쇄**

`app/select/page.tsx` 내용을 리다이렉트 스텁으로 교체 (구 링크·북마크 하위호환):

```tsx
import { redirect } from "next/navigation";
export default function LegacySelectPage() {
  redirect("/concern");
}
```

`app/tarot/draw/page.tsx:110`의 `onBack: () => router.push("/select")` → `router.push("/tarot")`로 수정.

- [ ] **Step 3: 사주 상담 진입 잔여물 확인**

Run: `grep -rn '"/saju"' app components | grep -v api` — 홈/concern에서 사주 상담으로 보내는 링크가 남아 있으면 제거. `/saju` 라우트 자체는 보존 (진행 중 reading resume·과거 결과 열람용).
Expected: 신규 진입 경로 0, 기존 reading 열람 경로 정상.

- [ ] **Step 4: 빌드 + dev 확인 + 커밋**

```bash
npm run build
git add app/concern app/select app/tarot && git commit -m "feat(w1): 고민톡 타로 직행 — 방법 선택 제거, /select 폐쇄"
```

---

### Task 8: 사주 진열대 재편 — 가격·타로 리포트 정리·좋은 날 신설

**Files:**
- Modify: `lib/fortune/types.ts`
- Modify: `app/fortune/page.tsx` (진열 페이지 — FORTUNE_LIST 기반이면 자동 추종, 하드코딩 확인)
- Create: `app/fortune/good_days/page.tsx` (기존 `app/fortune/monthly/page.tsx` 구조 복제 — 생년월일 입력 → 리포트)
- Modify: `lib/fortune/prompt.ts` (good_days 리포트 프롬프트)

- [ ] **Step 1: FORTUNE_CONFIG 변경**

```typescript
// compat: cost 30 → 40
// compat_social: cost 30 → 35
// 신설:
good_days: {
  type: "good_days",
  label: "좋은 날 리포트",
  emoji: "📅",
  tagline: "앞으로 한 달, 너에게 좋은 날과 조심할 날",
  base: "saju",
  cost: 35,
  emotionTag: `${FORTUNE_SENTINEL_PREFIX}good_days`,
  href: "/fortune/good_days",
  active: true,
},
```

- `FortuneType` 유니온에 `"good_days"` 추가, `FORTUNE_LIST`에서 **타로 5종 제거 + good_days 추가** (진열 순서: compat, compat_social, saju_full, monthly, good_days, daily)
- `FORTUNE_GRADIENTS`·`FORTUNE_HASHTAGS`·`MAX_TOKENS_BY_FORTUNE`에 good_days 추가 (max_tokens 6500 — monthly와 동급)
- ⚠️ 타로 리포트의 `FORTUNE_CONFIG` 항목은 **삭제하지 않는다** (과거 reading 렌더·fortuneTypeFromTag 하위호환). `FORTUNE_LIST`에서만 빠져 진열이 사라짐. `active: false`로 마킹해 직링크 진입 시 "준비 중" 처리.

- [ ] **Step 2: good_days 프롬프트 작성**

`lib/fortune/prompt.ts`에 good_days 섹션 추가 — 기존 사주 상담 "좋은 날 추천" 상품의 프롬프트(`grep -rn "good_days" lib data`)를 one-shot 리포트 형식으로 이식: 팔자 요약 → 앞으로 30일 중 좋은 날 3~5개(날짜+이유) → 조심할 날 1~2개 → 마무리. 단정 예언 금지 톤 유지.

- [ ] **Step 3: 입력 페이지 생성**

`app/fortune/monthly/page.tsx`를 읽고 동일 구조로 `app/fortune/good_days/page.tsx` 생성 (프로필 선택/생년월일 입력 → `/api/fortune/create` 호출 — fortune 공통 파이프라인 재사용, type만 `good_days`).

- [ ] **Step 4: 사주 상담 4종 진입 폐쇄 확인**

/select 폐쇄(Task 7)로 신규 진입은 이미 차단. `lib/saju/products.ts`는 **삭제하지 않음** (과거 reading 표시용). `grep -rn "getSajuProducts" app components`로 잔여 진입 UI 확인 후 제거.

- [ ] **Step 5: 검증 + 커밋**

Run: `npm run build` → dev에서 /fortune 진열 6종(사주만)·가격 확인, good_days 생성 1회 실전 테스트 (dev 계정 별 사용)
```bash
git add lib/fortune app/fortune lib/saju && git commit -m "feat(w1): 사주 진열대 재편 — 궁합 40/관계궁합 35, 좋은 날 신설, 타로 리포트 진열 제거"
```

---

### Task 9: 탭 라벨 + 페이지 헤더

**Files:**
- Modify: `components/layout/BottomTab.tsx:24-79` (TABS 상수)
- Modify: 고민톡·사주 페이지 헤더 타이틀 (`app/page.tsx`, `app/fortune/page.tsx`)

- [ ] **Step 1: TABS 라벨 교체**

[BottomTab.tsx:27](../../../components/layout/BottomTab.tsx) `label: "고민 상담"` → `"고민톡"`, [BottomTab.tsx:38](../../../components/layout/BottomTab.tsx) `label: "별콩 운세"` → `"사주"`. href·아이콘·matchPrefixes 무수정. ("내 고민톡" 탭은 사이클 2에서 "우리 사이"로 교체 — 지금은 유지.)

- [ ] **Step 2: 페이지 헤더 풀네임**

홈 히어로/타이틀 영역에 "타로 고민톡", /fortune 상단 타이틀 "사주 운세" 표기 (스펙 §5 — 탭은 짧게, 헤더는 풀네임).

- [ ] **Step 3: 커밋**

```bash
git add components/layout/BottomTab.tsx app/page.tsx app/fortune
git commit -m "feat(w1): 탭 라벨 고민톡/사주 + 페이지 헤더 풀네임"
```

---

### Task 10: /start 광고 랜딩 variant 2종 (reunion·contact)

**Files:**
- Modify: `app/start/page.tsx`

- [ ] **Step 1: variant 추가**

`VARIANTS`에 `"reunion" | "contact"` 추가. 각 variant 정의:

```typescript
const HERO_COPY: Record<Variant, { line1: string; line2: string }> = {
  counsel: { line1: "요즘 마음 복잡하지?", line2: "별콩이가 들어줄게" },
  daily: { line1: "오늘 하루,", line2: "어떤 흐름일까?" },
  tarot: { line1: "카드는 네가", line2: "직접 뽑아" },
  reunion: { line1: "헤어진 그 사람,", line2: "아직 나를 생각할까?" },
  contact: { line1: "핸드폰만 보고 있는", line2: "너에게" },
};

/** 연애 직행 variant → 하이라이트 태그 */
const LOVE_VARIANT_TAG: Partial<Record<Variant, EmotionTag>> = {
  reunion: "재회할 수 있을까",
  contact: "언제 연락 올까, 타이밍이 궁금해",
};
```

- [ ] **Step 2: 연애 직행 레이아웃 (스펙 §8 랜딩)**

reunion/contact variant일 때 기존 메뉴 대신:
1. **하이라이트 카드**: 상단 라벨 "네가 보고 온 그 고민" + 태그명 + 메인 CTA "별콩이한테 물어보기" (기존 emotion 선택과 동일 핸들러 — `StartPending { kind: "emotion", tag }` 저장 → 로그인 → 핸드오프)
2. **"다른 연애 고민이라면"** — `LOVE_TAGS`에서 하이라이트 태그 제외한 5종 목록 (각각 동일 emotion 핸들러)
3. 하단 텍스트 링크 "연애 말고 다른 고민이 있다면 →" → `/` (홈)

기존 counsel/daily/tarot variant 레이아웃·핸드오프 로직은 무수정. 단 tarot variant가 `TAROT_FORTUNES`(타로 리포트)를 진열하고 있으면 — Task 8에서 진열 제거된 상품이므로 — 연애 존 태그 목록으로 교체.

- [ ] **Step 3: dev 확인 + 커밋**

Run: dev에서 `/start?v=reunion&utm_source=meta&utm_content=test&utm_term=test` 진입 → 하이라이트 카드·목록·비로그인 → 로그인 → 재회 고민 입력 핸드오프까지 통과 확인. `/start?v=contact`도 동일. utm이 user_acquisition에 기록되는지 확인.
```bash
git add app/start && git commit -m "feat(w1): /start 연애 직행 variant (reunion·contact)"
```

---

### Task 11: 환불정책 — 기간제 이용권 조항

**Files:**
- Modify: `app/refund/page.tsx` (제7조 앞에 신규 조항 삽입, 이후 조 번호 +1)

- [ ] **Step 1: 조항 추가**

```tsx
<Article title="제7조 (기간제 이용권)">
  기간 단위로 제공되는 이용권(예: 우리 사이 패스)에는 다음이 적용됩니다.
  <ol className="list-decimal pl-5 space-y-1 mt-2">
    <li><b>이용 개시 전</b>: 구매 후 대화 등 서비스 이용을 시작하지 않은 경우,
      사용한 별 전액이 잔액으로 반환됩니다.</li>
    <li><b>이용 개시 후</b>: 첫 이용이 발생한 시점부터 기간제 디지털 콘텐츠
      제공이 개시된 것으로 보아 반환이 제한됩니다.</li>
    <li><b>서비스 장애</b>: 회사의 귀책사유로 이용권 기간 중 서비스를
      이용하지 못한 경우, 해당 기간만큼의 이용기간 연장 또는 일할 계산한
      별 반환 중 선택할 수 있습니다.</li>
    <li>이용권 구매에 사용된 별의 현금 환불은 제1조·제2조를 따릅니다.</li>
  </ol>
</Article>
```

기존 제7조(회원 탈퇴)~제9조는 제8~10조로 번호 갱신.

- [ ] **Step 2: 커밋**

```bash
git add app/refund && git commit -m "docs(legal): 환불정책 기간제 이용권 조항 신설"
```

---

### Task 12: QA 하네스 + 통합 검증

**Files:**
- Modify: `qa/` 하네스 시나리오 (기존 구조 확인 후 신설 스프레드 케이스 추가)

- [ ] **Step 1: 하네스에 신설 스프레드 라운드 추가**

`qa/run.ts` 구조를 읽고 기존 tarot 시나리오를 복제해 최소 4케이스: `reunion_deep_7`(7장·심층 톤), `checkin_6`(대칭 점검), `stay_or_go_6`(비교 구조 — "헤어져" 지시 안 하는지), `chakra_7`(내면 톤). 어서션: [END] 도달, 회피 상용구 상한, 포지션 라벨 언급 여부.

- [ ] **Step 2: 실행**

Run: `npm run qa` (또는 하네스의 개별 시나리오 실행 방식)
Expected: 신설 케이스 통과. 실패 시 Task 3의 프롬프트 가이드 보강 후 재실행.

- [ ] **Step 3: E2E 수동 체크리스트 (dev 브라우저)**

- [ ] 홈: 연애 6 + 궁합 카드 + 비연애 4 렌더
- [ ] 각 연애 태그 → 고민 입력 → 5개 진열 → 신설 스프레드 하나로 드로우 → 별 차감 → 채팅 → [END] → 결과
- [ ] 타이밍 태그에 좋은 날 크로스링크 노출
- [ ] /fortune: 사주 6종·새 가격 (궁합 40)
- [ ] good_days 리포트 생성
- [ ] /start?v=reunion·contact 핸드오프
- [ ] 과거 reading(구 태그·구 스프레드) 열람 정상 (readings 리스트 + 결과 페이지)
- [ ] 구 딥링크 `/start?v=tarot` 정상

- [ ] **Step 4: AGENTS.md 갱신 + dev push**

AGENTS.md의 태그·스프레드·탭·운세 구조 서술을 이 플랜 결과로 갱신 (스테일 항목: 4탭 서술, 감정 태그 10종 v2, 사주 상담 4종). 이후:

```bash
git add AGENTS.md && git commit -m "docs: AGENTS.md W1 사이클1 구조 반영"
git push origin dev   # dev.byeolkongtalk.com 배포 — prod 아님
```

Expected: dev 도메인에서 사용자 최종 확인. **main 머지 금지.**

---

## Self-Review 결과

- 스펙 §1~§5·§8(랜딩)·§7(환불) 커버 확인. §6(우리 사이)·패스는 사이클 2 플랜, §8 광고 소재 제작·Meta 작업은 코드 외 사용자 액션 + 사이클 3.
- 타입 일관성: `getSpreadOptionsForTag(rawTag: string)` / `getPositionLabels(spread, category, rawTag?)` / `normalizeEmotionTag` — Task 2 정의를 5·7에서 동일 시그니처로 사용.
- 하위호환 경로 명시: LEGACY_EMOTION_TAGS, 타로 FORTUNE_CONFIG 보존, /select 리다이렉트, /saju 열람 보존.
