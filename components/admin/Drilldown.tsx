"use client";

// components/admin/Drilldown.tsx — 1층 값을 클릭해 펼치는 2층.
//
// 🔴 왜 lazy fetch 인가 — 2층 섹션이 8개고 각각 무거운 집계다. 서버에서 미리 다 돌리면
//    /admin 첫 페인트가 8배 느려지고, 실제로 펼치는 건 하루 한두 개다.
// 🔴 실패를 빈 화면으로 위장하지 않는다 — 조회가 죽으면 그렇게 말한다.
// 🔴 색은 `lib/admin/colors.ts` 에서 가져와 **style 로** 바인딩한다. Tailwind arbitrary-value
//    클래스에 보간하면(`text-[${STATUS.serious}]`) 정적 스캔에 안 걸려 CSS 가 아예 생성되지
//    않는다 — 컴파일·빌드·테스트는 다 통과하고 화면에서 색만 조용히 사라진다
//    (선례: SajuBoard ELEMENT_COLORS · CohortHeatmap · Metric/GuardrailRow).
//    GOLD 는 애초에 헥스가 아니라 `var(--color-gold)` 라 클래스에 넣는 것 자체가 불가능하다.
import { useState } from "react";
import { DivergingBar } from "./DivergingBar";
import { BlockNote } from "./BlockNote";
import { STATUS, GOLD } from "@/lib/admin/colors";
import type { Layer2Block, Layer2Response, Layer2Section } from "@/lib/admin/layer2-types";

export function Drilldown({
  section,
  label,
  days,
}: {
  section: Layer2Section;
  label: string;
  days: number;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Layer2Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || data || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/layer2?section=${section}&days=${days}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as Layer2Response);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] text-white/75 hover:bg-white/5"
      >
        <span>{label}</span>
        <span className="text-white/40">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-5 border-t border-white/10 px-4 py-4">
          {loading && <div className="text-[12px] text-white/40">불러오는 중…</div>}
          {error && (
            <div className="text-[12px]" style={{ color: STATUS.serious }}>
              조회 실패 — {error}
            </div>
          )}
          {data?.failed?.length ? (
            <div className="text-[12px]" style={{ color: STATUS.serious }}>
              일부 조회 실패: {data.failed.join(", ")} — 아래 숫자는 불완전하다.
            </div>
          ) : null}
          {data?.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
          {/* 🔴 `!data.failed?.length` 가 필요하다 — `!error` 는 **fetch 레벨** 실패만 본다.
              섹션의 push 가 전부 `else` 안에 있으면 RPC 가 죽었을 때 blocks=[] + failed=[…] 가
              되고, "일부 조회 실패 … 불완전하다"와 "표시할 데이터가 없다"가 **나란히** 뜬다. */}
          {data && data.blocks.length === 0 && !error && !data.failed?.length && (
            <div className="text-[12px] text-white/40">표시할 데이터가 없다.</div>
          )}
        </div>
      )}
    </div>
  );
}

function BlockView({ block }: { block: Layer2Block }) {
  if (block.kind === "bars") return <DivergingBar block={block} />;
  if (block.kind === "link")
    return (
      <div className="text-[13px]">
        <span className="text-white/70">{block.title} </span>
        <a className="underline underline-offset-2" style={{ color: GOLD }} href={block.href}>
          {block.label} →
        </a>
      </div>
    );
  return (
    <div>
      <div className="text-[13px] text-white/70 mb-2">{block.title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-white/45">
              {block.columns.map((c) => (
                <th key={c} className="px-2 py-1 text-left font-normal whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((r, i) => (
              <tr key={i} className="border-t border-white/5">
                {r.map((cell, j) => (
                  <td key={j} className="px-2 py-1 text-white/80 tabular-nums whitespace-nowrap">
                    {cell === null ? <span className="text-white/30">—</span> : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <BlockNote note={block.note} />
    </div>
  );
}
