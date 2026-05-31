const STEPS = ["고민", "운세 선택", "카드 (타로만)"] as const;

/** 고민 → 운세 선택 → 카드 3단 진행 표시 (current: 1~3) */
export default function ProgressSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="w-full max-w-md mx-auto px-5">
      <ol className="flex items-center justify-center gap-1.5">
        {STEPS.map((label, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;
          const isLast = step === STEPS.length;
          return (
            <li key={label} className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={[
                    "w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold leading-none transition-colors",
                    done
                      ? "bg-lilac-deep text-white"
                      : active
                      ? "bg-lilac-deep text-white ring-2 ring-lilac-soft"
                      : "bg-lilac-soft/70 text-text-light/70",
                  ].join(" ")}
                >
                  {done ? "✓" : step}
                </span>
                <span
                  className={[
                    "text-[12px] leading-none whitespace-nowrap transition-colors",
                    active
                      ? "font-bold text-eye-purple"
                      : done
                      ? "font-medium text-lilac-deep"
                      : "font-medium text-text-light/60",
                  ].join(" ")}
                >
                  {label}
                </span>
              </div>
              {!isLast && (
                <span
                  className={`w-4 h-[2px] rounded-full ${
                    done ? "bg-lilac-deep/50" : "bg-lilac-soft/70"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
