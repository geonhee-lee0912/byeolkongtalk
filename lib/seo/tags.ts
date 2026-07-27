// lib/seo/tags.ts — 감정 태그 ↔ SEO 슬러그 (lib/emotions.ts 태그 체계 v3 와 1:1)
import type { EmotionTag } from "@/lib/emotions";

export const TAG_SLUGS: Record<string, EmotionTag> = {
  "his-mind": "걔 속마음이 궁금해",
  "reunion": "재회할 수 있을까",
  "contact-timing": "언제 연락 올까, 타이밍이 궁금해",
  "some": "썸, 이 관계 어떻게 될까",
  "relationship-cooling": "요즘 우리, 예전 같지 않아",
  "new-love": "새로운 인연, 언제쯤 올까",
  "career": "진로·방향이 고민이야",
  "choice": "어떤 선택이 맞을지 모르겠어",
  "work-people": "직장·학교에서 사람이 어려워",
  "free-talk": "그냥 별콩이한테 털어놓고 싶어",
};

export function findTagBySlug(slug: string): EmotionTag | undefined {
  return TAG_SLUGS[slug];
}
