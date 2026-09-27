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
// 🔴 왜 네이티브 title 이 아니라 패널인가 — 이전 구현은 definition 을 라벨의 `title` 로 줬는데
//    ①터치에서는 뜨지 않고 ②`**강조**` 의 별표가 날것으로 노출된다(title 은 plain text 다).
//    definition 이 사실상 안 보이는 게 caveat 이 늘 보이는 것보다 큰 문제였다 — 그래서 뒤집었다.
import { Fragment, useState } from "react";
import { METRICS, sampleGate, isAlerting, type MetricKey, type MetricDef } from "@/lib/admin-metrics";
import { formatMetric } from "@/lib/admin/format";
import { STATUS } from "@/lib/admin/colors";
import { splitEmphasis } from "@/lib/text-emphasis";

/**
 * `**강조**` 를 <strong> 으로. 🔴 정규식을 다시 쓰지 않는다 — 짝 안 맞는 `**` 의 리터럴 유지
 * 같은 경계가 계약 테스트가 붙은 `splitEmphasis`(lib/text-emphasis.ts)에 잠겨 있다.
 * BlockNote 와 같은 원천을 쓰지만 래퍼 클래스는 공유하지 않는다 — 그쪽은 2층 각주 전용
 * 고정 스타일(11px·white/35·mt-2)이고 여기 definition 은 **읽으라고 펼치는 본문**이다.
 */
function Emph({ text }: { text: string }) {
  return (
    <>
      {splitEmphasis(text).map((s, i) =>
        s.bold ? (
          <strong key={i} className="font-semibold text-white/90">
            {s.text}
          </strong>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        )
      )}
    </>
  );
}

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
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          // 🔴 `aria-controls` 는 안 단다 — 패널은 닫히면 **언마운트**돼서 id 가 사라지고,
          //    aria-controls 가 없는 요소를 가리키게 된다. 같은 기능의 리포 선례 둘
          //    (Drilldown.tsx · fortune/CollapsibleSection.tsx)도 aria-expanded 만 쓴다.
          aria-label={`${m.label} 정의`}
          // -m-1/p-1 = 시각은 15px 원, 탭 영역은 23px (모바일에서 누를 수 있게).
          className="-m-1 shrink-0 p-1 text-white/45 hover:text-white/80"
        >
          <span
            aria-hidden
            className="grid h-[15px] w-[15px] place-items-center rounded-full border border-current text-[10px] leading-none"
          >
            ?
          </span>
        </button>
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
      {open && (
        // 🔴 `break-words` 가 없으면 375px 에서 가로 스크롤이 난다 — definition/caveat 에
        //    `admin_star_spend_breakdown` 같은 공백 없는 ASCII 토큰이 섞여 있고, 2칸 그리드의
        //    카드 안쪽 폭은 그보다 좁다. 한글은 알아서 접히지만 이런 토큰은 안 접힌다.
        <div className="mt-2.5 space-y-1.5 rounded-lg bg-black/25 p-2.5 text-[11px] leading-snug break-words">
          <div className="text-white/70">
            <Emph text={m.definition} />
          </div>
          {m.caveat && (
            <div className="text-white/45">
              <Emph text={m.caveat} />
            </div>
          )}
          {/* 현 구현이 정의와 다르다는 사실은 숫자를 읽기 전에 알아야 한다 — 숨기면 그 값이
              맞는 것처럼 읽힌다. 지금 카드로 그려지는 지표 중엔 drift 가 있는 것이 없다. */}
          {m.drift && (
            <div style={{ color: STATUS.warning }}>
              <Emph text={m.drift} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
