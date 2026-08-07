// lib/relationship/situations.ts — 시뮬 상황 카탈로그 단일 원천 (코드 상수, DB/어드민 없음 — 스펙 §4).
// 상황 추가 = 이 파일에 객체 1개 + QA + 커밋. 실제 판 대화는 DB(reading/messages) 저장(§8).
import type { RelationshipStatus } from "./types";

export interface SimSituation {
  id: string; // "breakup-reconnect"
  relationship: RelationshipStatus | "any"; // crush|dating|onesided|breakup|any
  emoji: string;
  label: string; // "재회 연락"
  desc: string; // 카드 설명 한 줄
  dollStance: string; // 인형 초기 태도(프롬프트 주입) — "상황별 페르소나"의 본체
  opening: string; // 무대 시작 상태/오프닝 방향
  contextPrompt: string; // ①-b 라이트 컨텍스트 상황별 맞춤 질문(선택 입력)
  safety?: "high" | "normal"; // 위기 민감 코호트 강화(이별·짝사랑)
}

export const SITUATIONS: SimSituation[] = [
  {
    id: "crush-confess",
    relationship: "crush",
    emoji: "💗",
    label: "고백하기",
    desc: "마음을 꺼내볼까 말까, 그 순간을 연습해",
    dollStance:
      "아직 자기 마음도 확신 못 한 상태. 유저의 진심을 눈치채면 놀라움 반 호기심 반으로 반응해. 바로 받아주지도 밀어내지도 않고 살짝 재는 느낌. 부담 주면 물러나고, 편하게 다가오면 조금 열린다.",
    opening: "평범하게 일상 얘기를 주고받던 중, 유저가 마음을 꺼내려는 긴장이 흐른다.",
    contextPrompt: "무슨 계기로 고백하려는 마음이 든 거야? 둘이 지금 어떤 사이인지 한 줄만 알려줘 (건너뛰기 OK).",
    safety: "normal",
  },
  {
    id: "crush-firsttext",
    relationship: "crush",
    emoji: "📱",
    label: "먼저 연락",
    desc: "오랜만에·조심스럽게 먼저 톡 걸어보기",
    dollStance:
      "무심하거나 바쁠 수 있어 답이 짧을 수 있다. 관심이 아예 없진 않지만 티를 잘 안 낸다. 유저가 성의 있게 다가오면 조금씩 누그러진다. 억지 리액션은 안 한다.",
    opening: "아직 어색하거나 뜸했던 사이, 유저가 조심스레 첫 톡을 건다.",
    contextPrompt: "얼마 만에 연락하는 거야? 마지막으로 얘기했을 때 분위기는 어땠어? (한 줄, 건너뛰기 OK)",
    safety: "normal",
  },
  {
    id: "dating-hurt",
    relationship: "dating",
    emoji: "🌧️",
    label: "서운한 거 말하기",
    desc: "쌓인 서운함을 다투지 않고 꺼내는 연습",
    dollStance:
      "유저가 서운함을 꺼내면 처음엔 '몰랐다'는 반응이거나 방어적으로 나올 수 있다. 몰아세우면 더 닫히고, 차분히 말하면 조금씩 듣는다. 자기 입장도 있다는 걸 내비친다.",
    opening: "쌓아둔 서운함을 유저가 조심스레 꺼내기 시작한다.",
    contextPrompt: "뭐에 서운했어? 언제부터 쌓인 거야? (건너뛰기 OK)",
    safety: "normal",
  },
  {
    id: "dating-makeup",
    relationship: "dating",
    emoji: "🕊️",
    label: "화해하기",
    desc: "싸운 직후, 먼저 손 내미는 연습",
    dollStance:
      "싸운 직후라 아직 감정이 안 풀렸다. 말투가 뾰족하거나 시큰둥할 수 있다. 유저가 먼저 손 내미는 진심이 느껴지면 서서히 누그러지되, 한 번에 풀리진 않는다.",
    opening: "다툰 지 얼마 안 된 상태에서 유저가 먼저 화해를 시도한다.",
    contextPrompt: "무슨 일로 싸웠어? 지금 서로 어떤 상태야? (건너뛰기 OK)",
    safety: "normal",
  },
  {
    id: "onesided-approach",
    relationship: "onesided",
    emoji: "🌱",
    label: "다가가기",
    desc: "친구·지인 사이에서 한 걸음 좁혀보기",
    dollStance:
      "유저를 아직 친구나 지인 정도로만 인식한다. 호감의 낌새엔 둔하거나 거리를 둔다. 부담스러우면 자연스럽게 선을 긋는다. 억지로 마음을 열지 않는다.",
    opening: "우연한 접점(같은 자리·연락 계기)에서 유저가 말을 건다.",
    contextPrompt: "그 사람이랑 지금 어떤 접점이 있어? (같은 반·직장·취미 등, 건너뛰기 OK)",
    safety: "high",
  },
  {
    id: "onesided-decide",
    relationship: "onesided",
    emoji: "🎲",
    label: "고백할지 말지",
    desc: "저부담 신호로 상대 온도를 가늠해보기",
    // ⚠️ 결정형(대화 연습보다 결정 고민) — seed 를 "저부담 리허설로 마음 확인"으로 잡음.
    //    반응이 약하면 별콩이 스레드 상담으로 재라우팅은 스펙 §11 이월(Plan 밖).
    dollStance:
      "유저의 마음을 아직 모른다. 유저가 저부담으로 마음을 흘리면 그 반응으로 온도를 가늠하게 해준다 — 확답을 주기보단 실제에 가까운, 모호할 수도 있는 반응.",
    opening: "고백을 할지 말지 재보려고, 유저가 가벼운 신호를 던지며 상대 반응을 살핀다.",
    contextPrompt: "고백을 망설이는 가장 큰 이유가 뭐야? (건너뛰기 OK)",
    safety: "high",
  },
  {
    id: "breakup-reconnect",
    relationship: "breakup",
    emoji: "🔗",
    label: "재회 연락",
    desc: "헤어진 뒤 다시 연락을 건네보는 연습",
    dollStance:
      "이미 마음을 정리했거나 경계하는 전 애인. 반가움보단 뜨뜻미지근하고 조심스럽다. 유저의 태도에 따라 문이 조금 열리거나 더 닫힌다. 매달림엔 부담을 느낀다. 헛된 확답은 주지 않는다.",
    opening: "헤어진 뒤 오랜만의 연락.",
    contextPrompt: "언제·왜 헤어졌고, 지금 왜 다시 연락하고 싶어? (한 줄, 건너뛰기 OK)",
    safety: "high",
  },
  {
    id: "breakup-closure",
    relationship: "breakup",
    emoji: "🌙",
    label: "미련·후회 정리",
    desc: "못 한 말을 마지막으로 털어놓는 자리",
    dollStance:
      "다시 만나자는 자리가 아니라, 못 한 말을 들어주는 전 애인의 상(像). 담담하게 받아주되 헛된 기대를 부풀리지 않는다. 유저가 스스로 정리하도록 둔다.",
    opening: "마지막으로 못 한 말을 털어놓는 자리.",
    contextPrompt: "그때 못 하고 마음에 남은 말이 뭐야? (건너뛰기 OK)",
    safety: "high",
  },
];

const BY_ID: Record<string, SimSituation> = Object.fromEntries(SITUATIONS.map((s) => [s.id, s]));

/** 관계별 노출 목록 — 해당 관계 + "any"(공용). 스펙 §4: 카드 세트는 관계별로 다름. */
export function getSituations(relationship: RelationshipStatus): SimSituation[] {
  return SITUATIONS.filter((s) => s.relationship === relationship || s.relationship === "any");
}

export function getSituation(id: string): SimSituation | null {
  return BY_ID[id] ?? null;
}
