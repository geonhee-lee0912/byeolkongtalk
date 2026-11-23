import type { FiveElement } from "@/lib/saju/elements";
import { ELEMENT_COLOR } from "@/lib/fortune/element";

const ORDER: FiveElement[] = ["목", "화", "토", "금", "수"];
// 받침 있는 목·금은 '이', 나머지는 '가'
const SUBJECT: Record<FiveElement, string> = { 목: "목이", 화: "화가", 토: "토가", 금: "금이", 수: "수가" };

// 기운 세기 한 줄 띠 — 숨은 기운(지장간)·일간 가중치까지 친 값(palja.elementDist). 위 사주 판의 '여덟 글자 개수'와
// 다른 숫자라 이름표를 붙이고, 결과 맨 위 'O 기운'(palja.element)이 왜 그건지 한 줄로 잇는다.
// 운세 결과 오행 띠(ElementChart)와 같은 모양. 디자인 다듬기 사주 MBTI 결과 ⑦ P1 운영자 11-20(옛 오각형 차트)
export function ElementStrengthBand({ dist, top }: { dist: Record<FiveElement, number>; top: FiveElement }) {
  const v = (e: FiveElement) => Math.round((dist[e] ?? 0) * 10) / 10;
  return (
    <div className="max-w-[360px] mx-auto mt-4 px-3">
      <p className="text-13 font-bold text-accent mb-2">
        기운 세기 <span className="text-11 font-semibold text-text-light">숨은 기운까지 쳐서</span>
      </p>
      <div className="flex h-3.5 gap-0.5 rounded-full overflow-hidden">
        {ORDER.filter((e) => v(e) > 0).map((e) => (
          <div key={e} style={{ flex: v(e), background: ELEMENT_COLOR[e] }} />
        ))}
      </div>
      <div className="flex mt-2">
        {ORDER.map((e) => (
          <div key={e} className={`flex-1 text-center ${v(e) === 0 ? "opacity-40" : ""}`}>
            <p className="text-12 font-bold" style={{ color: ELEMENT_COLOR[e] }}>{e}</p>
            <p className="text-14 font-extrabold tabular-nums" style={{ color: e === top ? ELEMENT_COLOR[e] : "#5A3E8C" }}>
              {v(e)}
            </p>
          </div>
        ))}
      </div>
      <p className="text-13 text-eye-purple text-center mt-2">
        가장 센 <b style={{ color: ELEMENT_COLOR[top] }}>{SUBJECT[top].slice(0, 1)}</b>
        {SUBJECT[top].slice(1)} 네 기운이야
      </p>
    </div>
  );
}
