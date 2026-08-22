// 오행 관계 기반 상세 콘텐츠 (담백 서술·"나" 명시 없이 pivot 관점). 순수.
export interface RelationDetail {
  prose: string;
  keywords: string[];
  good: string;
  caution: string;
}

const BASE: Record<string, RelationDetail> = {
  생아: {
    prose: "곁에 있으면 기운을 받아 힘이 나는 사이",
    good: "함께면 안정되고 북돋아져",
    caution: "자꾸 기대게 될 수도 있어",
    keywords: ["보완", "안정"],
  },
  아생: {
    prose: "챙기고 베풀게 되는 사이",
    good: "돌봐주며 뿌듯한 사이",
    caution: "혼자 애쓰다 지칠 수도 있어",
    keywords: ["돌봄", "베풂"],
  },
  극아: {
    prose: "팽팽하게 자극이 오가는 사이",
    good: "긴장이 성장으로 이어져",
    caution: "세게 부딪힐 수 있어",
    keywords: ["자극", "긴장"],
  },
  아극: {
    prose: "내가 끌고 나가게 되는 흐름",
    good: "주도적으로 이끌어가",
    caution: "밀어붙이게 될 수도 있어",
    keywords: ["주도", "추진"],
  },
  비화: {
    prose: "닮아서 말 안 해도 통하는 사이",
    good: "편하고 공감이 잘 돼",
    caution: "비슷해서 무뎌질 수도 있어",
    keywords: ["공감", "편안"],
  },
};

const FALLBACK: RelationDetail = {
  prose: "이어져 있는 사이",
  good: "",
  caution: "",
  keywords: [],
};

// 특별 인연(끌림/결속/같은 결)은 인연 점수 근거 리스트가 담당 → 키워드는 오행 관계만(중복 방지).
export function relationDetail(element: string): RelationDetail {
  return BASE[element] ?? FALLBACK;
}
