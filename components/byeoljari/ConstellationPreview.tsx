"use client";
// 만들기 화면 장식용 예시 별자리(실제 렌더, 인터랙션 없음).
import { computeLayout } from "@/lib/byeoljari/layout";
import { scaleForCount } from "@/lib/byeoljari/scale";
import { resolveShape } from "@/lib/byeoljari/shape";
import type { StarGraph } from "@/lib/byeoljari/types";
import ConstellationCanvas from "./ConstellationCanvas";

const SAMPLE_ME_ID = "host";

// 호스트 1(나) + 게스트 14 = 15명, 오행 골고루 섞고 이름 공개 — 다인원 스케일까지 보이는 예시.
// 호스트 오행 화 기준 오행관계 패턴(목=생아·화=비화·토=아생·금=아극·수=극아)을 게스트 오행별로 재사용.
const SAMPLE: StarGraph = {
  ok: true,
  shareId: "sample",
  claimed: false,
  nodes: [
    { id: "host", name: "나", isHost: true, relationType: "friend", element: "화" },
    { id: "jiho", name: "지호", isHost: false, relationType: "friend", element: "목" },
    { id: "seoyeon", name: "서연", isHost: false, relationType: "lover", element: "화" },
    { id: "minjun", name: "민준", isHost: false, relationType: "acquaintance", element: "토" },
    { id: "haneul", name: "하늘", isHost: false, relationType: "senior", element: "금" },
    { id: "yuna", name: "유나", isHost: false, relationType: "friend", element: "수" },
    { id: "doyun", name: "도윤", isHost: false, relationType: "friend", element: "목" },
    { id: "siwoo", name: "시우", isHost: false, relationType: "lover", element: "화" },
    { id: "haeun", name: "하은", isHost: false, relationType: "acquaintance", element: "토" },
    { id: "jian", name: "지안", isHost: false, relationType: "senior", element: "금" },
    { id: "yejun", name: "예준", isHost: false, relationType: "friend", element: "수" },
    { id: "sua", name: "수아", isHost: false, relationType: "friend", element: "목" },
    { id: "ijun", name: "이준", isHost: false, relationType: "acquaintance", element: "화" },
    { id: "seojun", name: "서준", isHost: false, relationType: "friend", element: "토" },
    { id: "chaewon", name: "채원", isHost: false, relationType: "lover", element: "금" },
  ],
  edges: [
    // 호스트→게스트 14개(방사형 연결) — 오행별 관계 패턴 재사용.
    {
      a: "host",
      b: "jiho",
      element: "생아",
      labelAtoB: "날 북돋는 사람",
      labelBtoA: "내가 챙겨주는 사람",
      tenGodAtoB: "편인",
      tenGodBtoA: "식신",
      inyeon: 62,
      triadShared: false,
      heavenlyCombo: false,
      sixCombo: false,
    },
    {
      a: "host",
      b: "seoyeon",
      element: "비화",
      labelAtoB: "나란히 걷는 친구",
      labelBtoA: "나란히 걷는 친구",
      tenGodAtoB: "비견",
      tenGodBtoA: "비견",
      inyeon: 75,
      triadShared: false,
      heavenlyCombo: true, // 골드 엣지(끌림) 1
      sixCombo: false,
    },
    {
      a: "host",
      b: "minjun",
      element: "아생",
      labelAtoB: "내가 챙겨주는 사람",
      labelBtoA: "날 북돋는 사람",
      tenGodAtoB: "식신",
      tenGodBtoA: "편인",
      inyeon: 62,
      triadShared: false,
      heavenlyCombo: false,
      sixCombo: false,
    },
    {
      a: "host",
      b: "haneul",
      element: "아극",
      labelAtoB: "내가 이끄는 사람",
      labelBtoA: "날 긴장시키는 사람",
      tenGodAtoB: "편재",
      tenGodBtoA: "편관",
      inyeon: 62,
      triadShared: false,
      heavenlyCombo: false,
      sixCombo: false,
    },
    {
      a: "host",
      b: "yuna",
      element: "극아",
      labelAtoB: "날 긴장시키는 사람",
      labelBtoA: "내가 이끄는 사람",
      tenGodAtoB: "편관",
      tenGodBtoA: "편재",
      inyeon: 62,
      triadShared: false,
      heavenlyCombo: false,
      sixCombo: false,
    },
    {
      a: "host",
      b: "doyun",
      element: "생아",
      labelAtoB: "날 북돋는 사람",
      labelBtoA: "내가 챙겨주는 사람",
      tenGodAtoB: "편인",
      tenGodBtoA: "식신",
      inyeon: 62,
      triadShared: false,
      heavenlyCombo: false,
      sixCombo: false,
    },
    {
      a: "host",
      b: "siwoo",
      element: "비화",
      labelAtoB: "나란히 걷는 친구",
      labelBtoA: "나란히 걷는 친구",
      tenGodAtoB: "비견",
      tenGodBtoA: "비견",
      inyeon: 50,
      triadShared: false,
      heavenlyCombo: false,
      sixCombo: false,
    },
    {
      a: "host",
      b: "haeun",
      element: "아생",
      labelAtoB: "내가 챙겨주는 사람",
      labelBtoA: "날 북돋는 사람",
      tenGodAtoB: "식신",
      tenGodBtoA: "편인",
      inyeon: 62,
      triadShared: false,
      heavenlyCombo: false,
      sixCombo: false,
    },
    {
      a: "host",
      b: "jian",
      element: "아극",
      labelAtoB: "내가 이끄는 사람",
      labelBtoA: "날 긴장시키는 사람",
      tenGodAtoB: "편재",
      tenGodBtoA: "편관",
      inyeon: 62,
      triadShared: false,
      heavenlyCombo: false,
      sixCombo: false,
    },
    {
      a: "host",
      b: "yejun",
      element: "극아",
      labelAtoB: "날 긴장시키는 사람",
      labelBtoA: "내가 이끄는 사람",
      tenGodAtoB: "편관",
      tenGodBtoA: "편재",
      inyeon: 62,
      triadShared: false,
      heavenlyCombo: false,
      sixCombo: false,
    },
    {
      a: "host",
      b: "sua",
      element: "생아",
      labelAtoB: "날 북돋는 사람",
      labelBtoA: "내가 챙겨주는 사람",
      tenGodAtoB: "편인",
      tenGodBtoA: "식신",
      inyeon: 62,
      triadShared: false,
      heavenlyCombo: false,
      sixCombo: false,
    },
    {
      a: "host",
      b: "ijun",
      element: "비화",
      labelAtoB: "나란히 걷는 친구",
      labelBtoA: "나란히 걷는 친구",
      tenGodAtoB: "비견",
      tenGodBtoA: "비견",
      inyeon: 50,
      triadShared: false,
      heavenlyCombo: false,
      sixCombo: false,
    },
    {
      a: "host",
      b: "seojun",
      element: "아생",
      labelAtoB: "내가 챙겨주는 사람",
      labelBtoA: "날 북돋는 사람",
      tenGodAtoB: "식신",
      tenGodBtoA: "편인",
      inyeon: 62,
      triadShared: false,
      heavenlyCombo: false,
      sixCombo: false,
    },
    {
      a: "host",
      b: "chaewon",
      element: "아극",
      labelAtoB: "내가 이끄는 사람",
      labelBtoA: "날 긴장시키는 사람",
      tenGodAtoB: "편재",
      tenGodBtoA: "편관",
      inyeon: 62,
      triadShared: false,
      heavenlyCombo: false,
      sixCombo: false,
    },
    // 게스트↔게스트 2개(엣지 수 억제 — 전체 연결 대신 소수만).
    {
      a: "jiho",
      b: "doyun",
      element: "비화",
      labelAtoB: "나란히 걷는 친구",
      labelBtoA: "나란히 걷는 친구",
      tenGodAtoB: "비견",
      tenGodBtoA: "비견",
      inyeon: 90,
      triadShared: true, // 목 삼합(jiho·doyun·sua) 공유
      heavenlyCombo: true, // 골드 엣지(끌림) 2
      sixCombo: false,
    },
    {
      a: "minjun",
      b: "haeun",
      element: "비화",
      labelAtoB: "티격태격 짝꿍",
      labelBtoA: "티격태격 짝꿍",
      tenGodAtoB: "겁재",
      tenGodBtoA: "겁재",
      inyeon: 50,
      triadShared: false,
      heavenlyCombo: false,
      sixCombo: false,
    },
  ],
  triads: [
    { element: "목", memberIds: ["jiho", "doyun", "sua"] },
    { element: "금", memberIds: ["haneul", "jian", "chaewon"] },
  ],
};

export default function ConstellationPreview() {
  const layout = computeLayout(SAMPLE.nodes);
  const sizes = scaleForCount(SAMPLE.nodes.length);
  const shape = resolveShape(SAMPLE.nodes);

  return (
    <div className="pointer-events-none mx-auto w-full max-w-[240px]" aria-hidden>
      <div className="overflow-hidden rounded-2xl" style={{ aspectRatio: "1 / 1" }}>
        <ConstellationCanvas
          graph={SAMPLE}
          layout={layout}
          meId={SAMPLE_ME_ID}
          transform={{ tx: 0, ty: 0, s: 1 }}
          sizes={sizes}
          activeFilter={null}
          shape={shape}
          onSelect={() => {}}
        />
      </div>
    </div>
  );
}
