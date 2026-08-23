// 별자리 크기·선 두께 — 인원수 무관 고정(2026-08-23 사용자: 인원 적응 보간이 복잡·실익 낮아 제거).
// 선 두께는 끌림·결속·같은 결 통일(단일 lineWidth). 라벨만 20명 초과 시 숨김(겹침 방지 방어).
export interface SizeSpec {
  hostOuter: number; // 주인 원 반경
  starOuter: number; // 별 바깥 꼭지
  starInner: number; // 별 안쪽 꼭지(통통함 ≈0.55)
  hitR: number; // 투명 히트영역 반경
  lineWidth: number; // 모든 관계선(끌림·결속·같은 결) 공통 두께
  labelFont: number;
  hostLabelFont: number;
  showLabels: boolean;
}

// 주인 원(hostOuter)은 별(starOuter)보다 살짝 작게 — 원이 꽉 차 시각적으로 별과 균형.
const SIZE: Omit<SizeSpec, "showLabels"> = {
  hostOuter: 3.04, // 별 대비 ×0.8 축소(2026-08-23 사용자)
  starOuter: 3.2,
  starInner: 1.76,
  hitR: 6.0, // 터치영역은 축소 안 함(탭 편의)
  lineWidth: 0.7,
  labelFont: 3.0,
  hostLabelFont: 3.4,
};

/** 크기·선 두께는 고정, 라벨 표시만 인원 의존(20명↓). 함수명·시그니처는 호출부 호환 위해 유지. */
export function scaleForCount(n: number): SizeSpec {
  return { ...SIZE, showLabels: n <= 20 };
}
