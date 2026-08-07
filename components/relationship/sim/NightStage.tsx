"use client";
// components/relationship/sim/NightStage.tsx — 밤 무대 시각 셸(FE5). night 배경 + 금색 별 파티클 +
// 접히는 인형 + 프레임 고지 노트 + 하단 자리. 대화 로직(say/note SSE, 입력창, 💭 도움)은 FE6 이 채운다.
import { useState } from "react";
import DollPortrait, { NightStars } from "./DollPortrait";
import ByeolkongNote from "./ByeolkongNote";
import type { RelationshipStatus } from "@/lib/relationship/types";

export interface NightStageProps {
  simReadingId: string;
  status: RelationshipStatus;
  label: string;
  frame: string;
  onDebrief: () => void;
}

export default function NightStage(props: NightStageProps) {
  // 첫 유저 발화 후 인형이 sticky 소형으로 접힘 — FE5 에선 항상 false(미사용 setter), FE6 이 setStarted 소비.
  const [started, setStarted] = useState(false);

  return (
    <div className="relative flex flex-col" style={{ height: "100dvh" }}>
      <NightStars />
      <div className="sticky top-0 z-10 bg-gradient-to-b from-night to-transparent px-4 pt-3 pb-2">
        <DollPortrait status={props.status} label={props.label} collapsed={started} />
      </div>
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        <ByeolkongNote text={props.frame} kind="frame" />
        {/* FE6: 인형 버블(SimBubble) + 별콩이 노트(ByeolkongNote kind="note") + liveText 스트리밍 */}
      </div>
      <div className="relative z-10 border-t border-lilac-mid/20 bg-night-deep/80 px-3 py-2.5 flex items-center justify-between">
        {/* FE6: 💭 도움 / 입력창 */}
        <span className="text-[12px] text-lilac/60">FE6: 입력창</span>
        <button onClick={props.onDebrief} className="text-gold-soft text-sm px-3 py-1.5">
          정리하기
        </button>
      </div>
    </div>
  );
}
