// 2026 열두 달 흐름 타임라인 — timing.good/caution 문자열에서 달 숫자를 뽑아 하이라이트.
// 결정론적 파싱(LLM 미경유). 숫자가 없으면(정성적 표현) 전부 중립으로 표시(graceful).

const GOOD = "#65b28f";
const CAUTION = "#e0976b";

function parseMonths(s: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!s) return out;
  for (const m of s.match(/\d{1,2}/g) ?? []) {
    const n = Number(m);
    if (n >= 1 && n <= 12) out.add(n);
  }
  return out;
}

export default function YearTimeline({ good, caution }: { good?: string; caution?: string }) {
  const goodM = parseMonths(good);
  const cautionM = parseMonths(caution);

  return (
    <div>
      <div className="flex gap-[3px]">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const g = goodM.has(m);
          const c = cautionM.has(m);
          const bg = g ? GOOD : c ? CAUTION : "#F0EEF4";
          const fg = g || c ? "#fff" : "#9C95AE";
          return (
            <div
              key={m}
              className="flex-1 h-9 rounded-lg flex items-center justify-center text-[11px] font-extrabold tabular-nums"
              style={{ background: bg, color: fg }}
              title={`${m}월${g ? " · 좋은 달" : c ? " · 점검할 달" : ""}`}
            >
              {m}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-4 mt-2.5">
        <span className="flex items-center gap-1.5 text-[11px] text-text-light">
          <span className="w-3 h-3 rounded" style={{ background: GOOD }} />
          좋은 달
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-text-light">
          <span className="w-3 h-3 rounded" style={{ background: CAUTION }} />
          점검할 달
        </span>
      </div>
    </div>
  );
}
