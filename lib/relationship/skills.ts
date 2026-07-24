// lib/relationship/skills.ts — "우리 사이" 스킬 단일 진실 원천 (확장 가능)
// 서버검증·가격·UI(칩/메뉴)가 이 config 를 자동 추종. 스킬 추가 = 항목 + 프롬프트만.
import type { SpreadType } from "@/lib/tarot/spreads";

export type SkillKind = "tarot_draw" | "compat" | "dialogue";

export interface RelationshipSkill {
  key: string;
  label: string;
  tagline: string;
  emoji: string;
  starCost: number;
  kind: SkillKind;
  spread?: SpreadType; // kind="tarot_draw"
  requiresPartnerBirth?: boolean; // compat
  active: boolean;
  order: number;
}

export const RELATIONSHIP_SKILLS: RelationshipSkill[] = [
  {
    key: "checkin",
    label: "관계 체크인",
    tagline: "두 사람의 상태와 서로의 필요를 나란히",
    emoji: "💞",
    starCost: 45,
    kind: "tarot_draw",
    spread: "checkin_6",
    active: true,
    order: 1,
  },
  {
    key: "deep_feelings",
    label: "걔 속마음",
    tagline: "겉모습 뒤의 진짜 속마음까지",
    emoji: "🔍",
    starCost: 40,
    kind: "tarot_draw",
    spread: "deep_feelings_5",
    active: true,
    order: 2,
  },
  {
    key: "compat",
    label: "우리 궁합",
    tagline: "두 사람 사주로 보는 궁합",
    emoji: "💑",
    starCost: 40,
    kind: "compat",
    requiresPartnerBirth: true,
    active: true,
    order: 3,
  },
  {
    key: "verdict",
    label: "싸움 잘잘못 판정",
    tagline: "양쪽 입장을 듣고 비율로 판정 + 화해 처방",
    emoji: "⚖️",
    starCost: 30,
    kind: "dialogue",
    active: true,
    order: 4,
  },
];

const BY_KEY: Record<string, RelationshipSkill> = Object.fromEntries(
  RELATIONSHIP_SKILLS.map((s) => [s.key, s])
);

export function getSkill(key: string): RelationshipSkill | null {
  return BY_KEY[key] ?? null;
}

/** 진열용(active만, order순). */
export function listActiveSkills(): RelationshipSkill[] {
  return RELATIONSHIP_SKILLS.filter((s) => s.active).sort((a, b) => a.order - b.order);
}

/** 복귀 인사 버블 텍스트 — 스킬 결과를 보고 스레드로 돌아왔을 때 별콩이가 먼저 짚는 한마디. */
export function buildSkillRecapText(skillKey: string, summary: string): string {
  const skill = getSkill(skillKey);
  const label = skill?.label ?? "스킬";
  const emoji = skill?.emoji ?? "✨";
  const s = summary.trim();
  const head = `${emoji} ${label} 결과 봤어!`;
  const tail = "이거 갖고 더 얘기하고 싶은 거 있으면 편하게 꺼내봐.";
  return s ? `${head}\n${s}\n\n${tail}` : `${head} ${tail}`;
}
