"use client";

// 인-스레드 궁합 카드 — 관계 스레드에 별콩이가 건넨 궁합 결과(접기/펴기).
// content=compat 리포트 JSON 인 assistant 메시지에서 ThreadChat 이 렌더한다(별도 페이지 없음).
import { useState } from "react";
import type { CompatReport } from "@/lib/fortune/compat-report";

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-cream-warm rounded-2xl px-3.5 py-3 border border-lilac-mid/25">
      <h4 className="text-[12.5px] font-bold text-lilac-deep mb-1">{title}</h4>
      <p className="text-[12.5px] text-[#322E3D] leading-[1.75] whitespace-pre-line">{body}</p>
    </div>
  );
}

export default function ThreadCompatCard({
  report,
  partnerLabel,
}: {
  report: CompatReport;
  partnerLabel?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const namesLine = partnerLabel ? `나 ⟡ ${partnerLabel}` : "우리 궁합";

  return (
    <div className="flex justify-start mb-3 pl-10">
      <div className="w-full max-w-[300px] bg-white rounded-2xl border border-lilac-mid/40 shadow-sm px-3.5 pt-3 pb-3.5">
        {/* 헤더 — 등급 배지 + 테마 */}
        <div className="flex items-center gap-1.5 text-[11px] text-text-light mb-2">
          <span aria-hidden>💑</span>
          <span className="font-bold text-eye-purple">{namesLine}</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="shrink-0 rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-bold text-[#7a5a12]">
            {report.grade}
          </span>
          <span className="text-[12.5px] font-bold text-eye-purple leading-snug">{report.theme}</span>
        </div>

        {/* summary — 접힘엔 2줄 클램프 */}
        <p
          className={`text-[12.5px] text-[#322E3D] leading-[1.7] whitespace-pre-line ${
            open ? "" : "line-clamp-2"
          }`}
        >
          {report.summary}
        </p>

        {open && (
          <div className="mt-3 flex flex-col gap-2.5">
            <Section title="🔮 오행 케미" body={report.chemistry} />
            <Section title="💘 끌림·성격 케미" body={report.attraction} />
            <Section title="🌗 갈등 포인트" body={report.conflict} />
            <Section title="🌱 장기 전망" body={report.longterm} />
            <div className="bg-cream-warm rounded-2xl px-3.5 py-3 border border-lilac-mid/25">
              <h4 className="text-[12.5px] font-bold text-lilac-deep mb-1.5">💡 관계를 위한 조언</h4>
              <ol className="flex flex-col gap-1">
                {report.advice.map((a, i) => (
                  <li key={i} className="flex gap-1.5 text-[12.5px] text-[#322E3D] leading-[1.6]">
                    <span className="font-bold text-lilac-deep shrink-0">{i + 1}.</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div
              className="rounded-2xl px-3.5 py-3 text-white"
              style={{ background: "linear-gradient(140deg, #2A1F4D, #1F1735)" }}
            >
              <h4 className="text-[12.5px] font-bold text-gold mb-1">🌙 별콩이의 한마디</h4>
              <p className="text-[12.5px] leading-[1.8] text-white/90 whitespace-pre-line">{report.note}</p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`w-full mt-3 rounded-xl text-[12px] font-bold py-2.5 active:scale-[0.98] transition ${
            open ? "bg-lilac-soft/60 text-lilac-deep" : "bg-lilac-deep text-white"
          }`}
        >
          {open ? "접기 ▴" : "전체 궁합 펼쳐보기 ▾"}
        </button>
      </div>
    </div>
  );
}
