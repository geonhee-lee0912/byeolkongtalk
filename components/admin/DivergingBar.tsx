// components/admin/DivergingBar.tsx — 발산 가로 막대.
//
// 스펙 §8: +/− 는 **위치로도** 전달한다(0선 기준 좌우). 색만으로 부호를 전하면 CVD 에서 사라진다.
// 데이터 끝단만 4px 라운드 · 막대 사이 2px 간격.
//
// 🔴 색은 `lib/admin/colors.ts` 에서 가져온다 — 헥스를 다시 타이핑하지 않는다(리브랜딩 때 갈린다).
//    슬롯 2(CATEGORICAL[1], 주황)=음수 · 슬롯 3(CATEGORICAL[2], 초록)=양수.
import { formatMetric, formatSignedWon } from "@/lib/admin/format";
import { CATEGORICAL } from "@/lib/admin/colors";
import { BlockNote } from "./BlockNote";
import type { BarsBlock } from "@/lib/admin/layer2-types";

/**
 * 🔴 금액 막대는 `formatSignedWon`(U+2212 `−` + 부호 명시)이다 — `formatMetric(v,"won")` 은
 *    ASCII 하이픈 `-12,400원` 을 준다. 1층 히어로(ContributionHero·BandGauge)가 이미
 *    formatSignedWon 을 쓰므로, 그대로 두면 **같은 화면에서 기여 금액의 글리프가 갈린다**
 *    (`tabular-nums` 는 숫자 폭만 맞추고 하이픈은 안 맞춘다).
 *
 *    왜 unit 만 보고 갈라도 되나: 발산 막대는 **부호가 의미인 차트**다(0선 기준 좌우가 존재
 *    이유). 전량 양수인 금액 계열이면 애초에 발산 막대를 쓸 일이 없다. 반면 `count`·`percent`
 *    계열(별 소모 5종 등)은 부호 개념이 없으므로 formatMetric 그대로 — `+` 가 안 붙는다.
 */
const barLabel = (value: number, unit: BarsBlock["unit"]): string =>
  unit === "won" ? formatSignedWon(value) : formatMetric(value, unit);

export function DivergingBar({ block }: { block: BarsBlock }) {
  const max = Math.max(1, ...block.items.map((i) => Math.abs(i.value)));
  return (
    <div>
      <div className="text-[13px] text-white/70 mb-2">{block.title}</div>
      <div className="space-y-[2px]">
        {block.items.map((it) => {
          const pct = (Math.abs(it.value) / max) * 50; // 0선이 가운데 → 최대 50%
          const negative = it.value < 0;
          return (
            <div key={it.label} className="flex items-center gap-2 text-[12px]">
              <div className="w-28 shrink-0 truncate text-white/60" title={it.label}>
                {it.label}
              </div>
              <div className="relative h-4 flex-1">
                <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
                <div
                  className="absolute inset-y-[2px]"
                  style={{
                    [negative ? "right" : "left"]: "50%",
                    width: `${pct}%`,
                    background: negative ? CATEGORICAL[1] : CATEGORICAL[2],
                    borderRadius: negative ? "4px 0 0 4px" : "0 4px 4px 0",
                  }}
                />
              </div>
              <div className="w-24 shrink-0 text-right text-white/80 tabular-nums">
                {barLabel(it.value, block.unit)}
              </div>
            </div>
          );
        })}
      </div>
      <BlockNote note={block.note} />
    </div>
  );
}
