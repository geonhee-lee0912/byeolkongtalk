"use client";

// components/admin/GuardrailRow.tsx — 가드레일 6종. 평소엔 조용하고 임계를 벗어나면 빨강.
//
// 로드맵 v2 §3 에 정의돼 있으나 어드민에 하나도 없던 줄이다. 값이 아니라 **상태**를 읽는 자리라
// 카드가 아니라 한 줄로 늘어놓는다.
//
// 🔴 왜 client 가 됐나 — 칸마다 `?` 패널의 open 상태를 든다. props(GuardView[])는 문자열·숫자·
//    불린뿐이라 서버 컴포넌트(app/admin/page.tsx)에서 그대로 넘어온다.
//
// 🔴 `?` 버튼과 패널은 `MetricInfo.tsx` 가 정본이다 — Metric 카드와 **같은 것**을 쓴다. 여기에
//    사본을 만들지 말 것. 이전 구현의 `title={m.definition}` 은 제거했다: 패널과 중복인 데다
//    네이티브 title 은 plain text 라 `**강조**` 의 별표가 날것으로 뜬다(고치려는 그 결함이
//    hover 경로에만 남는다).
import { useState } from "react";
import { METRICS, type MetricDef } from "@/lib/admin-metrics";
import { formatMetric } from "@/lib/admin/format";
import { STATUS } from "@/lib/admin/colors";
import type { GuardView } from "@/lib/admin/layer1";
import { InfoPanel, InfoToggle } from "@/components/admin/MetricInfo";

export function GuardrailRow({ guards }: { guards: GuardView[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
      {guards.map((g) => (
        <GuardCell key={g.key} guard={g} />
      ))}
    </div>
  );
}

/** 칸 하나. 제 open 상태를 들어야 해서 컴포넌트로 뗐다(맵 안에서는 훅을 못 쓴다). */
function GuardCell({ guard: g }: { guard: GuardView }) {
  // 🔴 `MetricDef` 명시 — Task 1 에서 확인된 규칙이다. 빼면 alertBelow/alertAbove 접근이
  //    TS2339 로 죽는다(경보선 없는 지표가 유니온에 섞여 있다).
  const m: MetricDef = METRICS[g.key];
  const threshold =
    m.alertBelow !== undefined ? `< ${m.alertBelow}` : m.alertAbove !== undefined ? `> ${m.alertAbove}` : "";
  // 칸마다 제 상태를 든다 — 바깥 클릭 닫기·단일 열림은 안 넣는다(Metric 과 같은 판단).
  const [open, setOpen] = useState(false);

  return (
    <div
      // 🔴 STATUS 는 Tailwind arbitrary-value 클래스 문자열에 보간할 수 없다(Metric.tsx 참조).
      //    색만 style 로 바인딩한다.
      className={`rounded-lg border px-3 py-2 ${g.alerting ? "" : "border-white/10 bg-white/[0.03]"}`}
      style={g.alerting ? { borderColor: STATUS.critical, backgroundColor: `${STATUS.critical}26` } : undefined}
    >
      <div className="flex items-center gap-1">
        <div className="text-[11px] text-white/55 min-w-0">{g.label}</div>
        <InfoToggle label={g.label} open={open} onToggle={() => setOpen((v) => !v)} />
      </div>
      <div
        className={`text-base font-bold ${g.alerting ? "" : "text-white/85"}`}
        style={g.alerting ? { color: STATUS.serious } : undefined}
      >
        {!g.show ? (
          <span className="text-[12px] font-normal text-white/40">{g.note}</span>
        ) : g.value === null ? (
          <span className="text-white/40">—</span>
        ) : (
          formatMetric(g.value, m.unit)
        )}
      </div>
      <div className="text-[10px] text-white/30">경보 {threshold}</div>
      {/* 🔴 카드 안 in-flow 패널이다(팝오버 아님) — 6칸 그리드는 2칸보다 더 좁아서 팝오버는
          뷰포트를 넘는다. in-flow 면 칸이 세로로 늘어날 뿐이다. */}
      {open && <InfoPanel def={m} />}
    </div>
  );
}
