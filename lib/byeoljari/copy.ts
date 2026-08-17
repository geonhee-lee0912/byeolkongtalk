// 관계분류 × 십신 40칸 카피 — 1:1 관계 뷰 문구(별콩이 반말·낙인 제거·완곡). 룰 100%·LLM 0.
// ⚠️ 방어적: enum 밖 relationType/tenGod 는 null 폴백 → 호출부가 중립 라벨(TEN_GOD_LABEL)로.
import type { TenGod } from "@/lib/saju/pairing";

// relationType 키: friend|lover|acquaintance|senior (GraphNode.relationType).
// Record<TenGod,string> 라 tsc 가 각 관계분류의 10칸 완전성을 강제한다(빠지면 컴파일 에러).
export const RELATION_TEN_GOD_COPY: Record<string, Record<TenGod, string>> = {
  friend: {
    비견: "말 안 해도 통하는 친구",
    겁재: "티격태격해도 붙어 다니는 친구",
    식신: "챙겨주고 싶은 친구",
    상관: "내 텐션 올려주는 친구",
    편재: "내가 앞장서게 되는 친구",
    정재: "오래 곁에 두고 싶은 친구",
    편관: "정신 번쩍 들게 하는 친구",
    정관: "믿고 기댈 친구",
    편인: "생각을 넓혀주는 친구",
    정인: "마음이 놓이는 친구",
  },
  lover: {
    비견: "편하게 닮아가는 사람",
    겁재: "밀당이 은근 재밌는 상대",
    식신: "다 해주고 싶은 사람",
    상관: "나를 반짝이게 하는 사람",
    편재: "내가 리드하는 사람",
    정재: "곱게 아끼는 사람",
    편관: "자꾸 밀당하게 되는 상대",
    정관: "듬직하게 안아주는 사람",
    편인: "새로운 세계를 보여주는 사람",
    정인: "포근하게 감싸주는 사람",
  },
  acquaintance: {
    비견: "왠지 나랑 비슷한 사람",
    겁재: "묘하게 경쟁되는 사람",
    식신: "나도 모르게 돌봐주는 사람",
    상관: "내 얘기 술술 꺼내게 하는 사람",
    편재: "내가 먼저 나서는 사람",
    정재: "잘 지내고 싶은 사람",
    편관: "괜히 신경 쓰이는 사람",
    정관: "은근히 의지되는 사람",
    편인: "묘하게 끌리는 사람",
    정인: "편히 기대게 되는 사람",
  },
  senior: {
    비견: "결이 닮은 선배",
    겁재: "자꾸 비교하게 되는 선배",
    식신: "살뜰히 챙기게 되는 분",
    상관: "내 재능 알아봐 주는 분",
    편재: "내가 먼저 다가가는 분",
    정재: "신뢰를 쌓고 싶은 분",
    편관: "어렵지만 날 키우는 어른",
    정관: "배울 게 많은 어른",
    편인: "영감을 주는 멘토",
    정인: "따뜻하게 이끌어 주는 분",
  },
};

/** 관계분류 × 십신 문구. 미지 조합이면 null(호출부가 중립 라벨로 폴백). */
export function relationTenGodCopy(relationType: string, tenGod: string): string | null {
  const byRel = RELATION_TEN_GOD_COPY[relationType];
  if (!byRel) return null;
  return byRel[tenGod as TenGod] ?? null;
}
