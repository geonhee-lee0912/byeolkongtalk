"use client";
// 만들기 화면 장식용 예시 별자리(실제 렌더, 인터랙션 없음).
import { computeLayout } from "@/lib/byeoljari/layout";
import { scaleForCount } from "@/lib/byeoljari/scale";
import { resolveShape } from "@/lib/byeoljari/shape";
import type { StarGraph } from "@/lib/byeoljari/types";
import ConstellationCanvas from "./ConstellationCanvas";

const SAMPLE_ME_ID = "host";

// 호스트 1 + 게스트 5, 오행 골고루 섞고 이름 공개 — 라벨·색이 다 보이는 예시.
const SAMPLE: StarGraph = {
  ok: true,
  shareId: "sample",
  claimed: false,
  nodes: [
    { id: "host", name: "나", isHost: true, relationType: "friend", element: "화", compatVisible: true },
    { id: "jiho", name: "지호", isHost: false, relationType: "friend", element: "목", compatVisible: true },
    { id: "seoyeon", name: "서연", isHost: false, relationType: "lover", element: "화", compatVisible: true },
    { id: "minjun", name: "민준", isHost: false, relationType: "acquaintance", element: "토", compatVisible: true },
    { id: "haneul", name: "하늘", isHost: false, relationType: "senior", element: "금", compatVisible: true },
    { id: "yuna", name: "유나", isHost: false, relationType: "friend", element: "수", compatVisible: true },
  ],
  edges: [
    {
      a: "host",
      b: "jiho",
      element: "생아",
      labelAtoB: "날 북돋는 사람",
      labelBtoA: "내가 챙겨주는 사람",
      tenGodAtoB: "편인",
      tenGodBtoA: "식신",
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
      heavenlyCombo: true, // 골드 엣지(끌림)
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
      heavenlyCombo: false,
      sixCombo: false,
    },
  ],
  triads: [{ element: "목", memberIds: ["jiho", "minjun", "yuna"] }],
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
