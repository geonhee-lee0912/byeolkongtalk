"use client";

// components/admin/Metric.tsx — 소표본 게이트가 걸린 지표 카드.
//
// 🔴 왜 "흐리게"가 아니라 "대체"인가 — 표본 12명으로 낸 전환율은 틀린 게 아니라 **판단 근거가 될
//    수 없다.** 흐리게 그리면 사람은 결국 읽고 판단한다. 숫자를 아예 치우고 n 을 보여주는 것만이
//    오판을 막는다(스펙 §7).
//
// 🔴 왜 client 인가 — `?` 는 라벨 옆에 있고 펼쳐지는 패널은 카드 **맨 아래**에 있다. 두 위치가
//    같은 open 상태를 공유해야 해서 카드 자체가 상태를 든다. props 는 전부 문자열·숫자라 서버
//    컴포넌트(app/admin/page.tsx)에서 그대로 넘어온다.
//
// 🔴 `?` 버튼과 패널의 마크업은 `MetricInfo.tsx` 가 정본이다 — 가드레일 6칸(GuardrailRow)이
//    같은 것을 쓴다. 여기에 사본을 만들지 말 것. 네이티브 title 을 버린 이유도 그 파일에 있다.
import { useState } from "react";
import { METRICS, sampleGate, isAlerting, type MetricKey, type MetricDef } from "@/lib/admin-metrics";
import { formatMetric } from "@/lib/admin/format";
import { STATUS } from "@/lib/admin/colors";
import { InfoPanel, InfoToggle } from "@/components/admin/MetricInfo";

export function Metric({
  metricKey,
  value,
  n,
  sub,
}: {
  metricKey: MetricKey;
  /** null = 조회 실패 또는 계산 불가(0 나눗셈). 0 과 구분된다. */
  value: number | null;
  /** 이 값을 만든 표본 크기. 카운트 지표는 minSample 이 0 이라 무시된다. */
  n: number;
  sub?: string;
}) {
  // 🔴 명시적 MetricDef 타입 필요 — METRICS 는 `as const satisfies` 라 원소별 좁은 리터럴
  // 타입을 유지한다. caveat 처럼 일부 지표만 갖는 선택 필드는 어노테이션 없이 유니온에서
  // 바로 접근하면 "일부 지표엔 그 키 자체가 없다"는 이유로 타입에러가 난다(lib/admin-metrics.ts
  // 의 isAlerting 과 동일 패턴).
  const m: MetricDef = METRICS[metricKey];
  const gate = sampleGate(metricKey, n);
  const alerting = gate.show && isAlerting(metricKey, value);
  // 카드마다 제 상태를 든다 — 바깥 클릭 닫기·단일 열림 같은 건 안 넣는다. `?` 를 다시 누르면
  // 닫히고, 두 카드를 나란히 펼쳐 비교하는 게 오히려 이 화면의 쓰임이다.
  const [open, setOpen] = useState(false);

  return (
    <div
      // 🔴 STATUS 는 Tailwind arbitrary-value 클래스 문자열에 보간할 수 없다(Tailwind 는 소스에
      //    literal 하게 적힌 클래스만 정적 스캔한다 — 코드베이스 선례: ELEMENT_COLORS/CohortHeatmap
      //    이 전부 style={{}} 로 동적 색을 준다). 그래서 색만 style 로 분리한다.
      className={`rounded-xl border p-4 ${alerting ? "" : "border-white/10 bg-white/5"}`}
      style={alerting ? { borderColor: STATUS.critical, backgroundColor: `${STATUS.critical}1a` } : undefined}
    >
      <div className="flex items-center gap-1">
        <div className="text-[12px] text-white/60 min-w-0">{m.label}</div>
        <InfoToggle label={m.label} open={open} onToggle={() => setOpen((v) => !v)} />
      </div>
      <div
        className="text-2xl font-bold mt-1"
        style={alerting ? { color: STATUS.serious } : undefined}
      >
        {!gate.show ? (
          <span className="text-base font-normal text-white/40">{gate.note}</span>
        ) : value === null ? (
          <span className="text-white/40">—</span>
        ) : (
          formatMetric(value, m.unit)
        )}
      </div>
      {sub && <div className="text-[12px] text-white/50 mt-1.5">{sub}</div>}
      {open && <InfoPanel def={m} />}
    </div>
  );
}
