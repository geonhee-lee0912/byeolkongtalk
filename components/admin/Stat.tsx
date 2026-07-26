// components/admin/Stat.tsx — 어드민 KPI 카드(Stat) + 어제 대비 증감(Delta).
// 왜 공유하나: 대시보드(app/admin/page.tsx)와 트래픽(app/admin/traffic/page.tsx)이 같은 표현을
// 써야 한다. 화면마다 복제하면 증감 색·소수점·"(어제 N)" 표기가 조용히 갈려서 두 화면 숫자를
// 나란히 놓고 못 읽게 된다.
import type { ReactNode } from "react";

// invert: 증가가 나쁜 지표(탈퇴 등)는 색을 뒤집는다 — 안 뒤집으면 탈퇴 급증이 초록으로 떠서 오독된다.
export function Delta({ today, yesterday, label = "어제", invert = false }: { today: number; yesterday: number; label?: string; invert?: boolean }) {
  if (yesterday === 0) return <span className="text-lg font-normal text-white/40">{label} 0</span>;
  const pct = ((today - yesterday) / yesterday) * 100;
  const up = invert ? pct < 0 : pct > 0;
  const down = invert ? pct > 0 : pct < 0;
  const cls = up ? "text-emerald-400" : down ? "text-red-400" : "text-white/40";
  // 바깥은 줄바꿈 허용 — 누적값이 커지면(예: "(어제까지 107,900)") 통짜 nowrap 이 375px 를 넘겨
  // 대시보드 전체에 가로 스크롤을 만든다. 조각별로만 nowrap 을 걸어 "%"와 "(…)" 사이에서 끊는다.
  return (
    <span className="text-lg font-normal">
      <span className={`${cls} whitespace-nowrap`}>{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</span>{" "}
      <span className="text-white/40 whitespace-nowrap">({label} {yesterday.toLocaleString()})</span>
    </span>
  );
}

export function Stat({ label, value, paren, children }: { label: string; value: string | number; paren?: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
      <div className="text-[12px] text-white/60">{label}</div>
      <div className="text-2xl font-bold mt-1 flex items-baseline gap-x-2 flex-wrap">
        <span>
          {value}
          {paren && <span className="text-sm font-normal text-white/50 ml-1.5">({paren})</span>}
        </span>
        {children}
      </div>
    </div>
  );
}
