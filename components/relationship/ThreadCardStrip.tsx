"use client";

// 인-스레드 카드 스트립 — 별콩이가 이 대화 안에서 뽑아 펼친 카드판.
// content=드로우 JSON 인 assistant 메시지에서 ThreadChat 이 렌더한다(별도 페이지 없음).
// CardSpreadView 를 그대로 재사용하되, 그 컴포넌트가 다크 배경 전용 색상이라 다크 패널로 감싼다.
import CardSpreadView from "@/components/tarot/CardSpreadView";
import { getSkill } from "@/lib/relationship/skills";
import type { ThreadDraw } from "@/lib/relationship/draw-thread";

export default function ThreadCardStrip({ draw }: { draw: ThreadDraw }) {
  const skill = getSkill(draw.skill);

  return (
    <div className="flex justify-start mb-3 pl-10">
      <div
        className="w-full max-w-[300px] rounded-2xl px-3.5 pt-3 pb-4 shadow-sm"
        style={{ background: "linear-gradient(150deg, #2A1F4D, #1F1735)" }}
      >
        <div className="flex items-center gap-1.5 mb-3">
          <span aria-hidden>{skill?.emoji ?? "🃏"}</span>
          <span className="text-[12px] font-bold text-gold">
            {skill?.label ?? "카드"}
          </span>
          <span className="text-[11px] text-white/50">· {draw.cards.length}장</span>
        </div>
        <CardSpreadView drawnCards={draw.cards} spreadType={draw.spread} activeIndex={null} />
      </div>
    </div>
  );
}
