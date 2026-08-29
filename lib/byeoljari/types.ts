// P2 GET(/api/fortune/byeoljari/[shareId]) 응답 계약. P3 렌더가 소비하는 클라 타입.
import type { FiveElement } from "@/lib/saju/elements";

export interface GraphNode {
  id: string;
  name: string | null; // name_public 옵트인 아니면 null(별만)
  isHost: boolean;
  relationType: string; // friend|lover|acquaintance
  element: FiveElement; // 목|화|토|금|수
  dayType: string; // "여름 큰산형" — 일간(천간)+월지
}

export interface GraphEdge {
  a: string;
  b: string;
  element: string; // a 기준 오행 관계: 비화|생아|아생|극아|아극 (오행 아님)
  labelAtoB: string; // 별콩 라벨 a→b
  labelBtoA: string; // 별콩 라벨 b→a
  tenGodAtoB: string; // a→b 십신 코드 (관계분류 조립용)
  tenGodBtoA: string; // b→a 십신 코드
  inyeon: number; // 0~100 종합 인연도(대칭)
  triadShared: boolean; // 두 끝점이 같은 삼합 국(근거 재구성용)
  heavenlyCombo: boolean;
  sixCombo: boolean;
}

export interface GraphTriad {
  element: FiveElement;
  memberIds: string[]; // 3 초과 가능 — 렌더는 length===3 가정 금지
  score?: number; // 무리(삼합) 평균 인연 점수 — 국 멤버 전원 쌍의 inyeon 평균(API 계산, PII 아님)
}

export interface StarGraph {
  ok: true;
  shareId: string;
  claimed: boolean;
  viewerIsOwner: boolean; // 뷰어=맵 주인(서버 세션 기준) — 주인 전용 UI 게이팅
  nodes: GraphNode[];
  edges: GraphEdge[];
  triads: GraphTriad[];
}
