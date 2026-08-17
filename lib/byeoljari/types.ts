// P2 GET(/api/fortune/byeoljari/[shareId]) 응답 계약. P3 렌더가 소비하는 클라 타입.
import type { FiveElement } from "@/lib/saju/elements";

export interface GraphNode {
  id: string;
  name: string | null; // name_public 옵트인 아니면 null(별만)
  isHost: boolean;
  relationType: string; // friend|lover|acquaintance|senior
  element: FiveElement; // 목|화|토|금|수
  compatVisible: boolean;
}

export interface GraphEdge {
  a: string;
  b: string;
  element: string; // a 기준 오행 관계: 비화|생아|아생|극아|아극 (오행 아님)
  labelAtoB: string; // 별콩 라벨 a→b
  labelBtoA: string; // 별콩 라벨 b→a
  tenGodAtoB: string; // a→b 십신 코드 (관계분류 조립용)
  tenGodBtoA: string; // b→a 십신 코드
  heavenlyCombo: boolean;
  sixCombo: boolean;
}

export interface GraphTriad {
  element: FiveElement;
  memberIds: string[]; // 3 초과 가능 — 렌더는 length===3 가정 금지
}

export interface StarGraph {
  ok: true;
  shareId: string;
  claimed: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  triads: GraphTriad[];
}
