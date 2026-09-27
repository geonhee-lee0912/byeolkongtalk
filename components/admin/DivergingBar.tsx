// components/admin/DivergingBar.tsx — 발산 가로 막대.
//
// 스펙 §8: +/− 는 **위치로도** 전달한다(0선 기준 좌우). 색만으로 부호를 전하면 CVD 에서 사라진다.
// 데이터 끝단만 4px 라운드 · 막대 사이 2px 간격.
//
// 🔴 색은 `lib/admin/colors.ts` 에서 가져온다 — 헥스를 다시 타이핑하지 않는다(리브랜딩 때 갈린다).
//    슬롯 2(CATEGORICAL[1], 주황)=음수 · 슬롯 3(CATEGORICAL[2], 초록)=양수.
import { formatMetric } from "@/lib/admin/format";
import { CATEGORICAL } from "@/lib/admin/colors";
import type { BarsBlock } from "@/lib/admin/layer2-types";

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
                {formatMetric(it.value, block.unit)}
              </div>
            </div>
          );
        })}
      </div>
      {block.note && <div className="text-[11px] text-white/35 mt-2 leading-snug">{block.note}</div>}
    </div>
  );
}
