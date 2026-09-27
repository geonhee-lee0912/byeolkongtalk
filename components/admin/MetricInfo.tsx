"use client";

// components/admin/MetricInfo.tsx — 지표 정의를 펼쳐 보는 `?` 버튼과 그 패널. 공용.
//
// 🔴 왜 공용인가 — 같은 `?`/패널을 Metric(1층 지표 카드)과 GuardrailRow(가드레일 6칸)가 쓴다.
//    사본을 두면 갈린다. 이 워크스트림이 이미 두 번 물린 클래스다(라우트 note 와 레지스트리의
//    drift, 같은 필터가 두 RPC 에 복제된 부채). 표기·접근성·줄바꿈 규칙을 여기 한 곳에 잠근다.
//
// 🔴 왜 컴포넌트가 둘로 갈라져 있나 — `?` 는 **라벨 옆**이고 패널은 **카드 맨 아래**다. 한 덩어리로
//    묶으려면 그 사이의 값·sub·경보선까지 이 파일이 감싸야 하고, 그러면 서로 다른 두 카드의
//    레이아웃이 여기로 딸려 들어온다. open 상태는 카드가 들고, 이 파일은 "버튼은 이렇게 생겼다 /
//    패널은 이렇게 생겼다"만 책임진다.
//
// 🔴 왜 네이티브 title 이 아니라 패널인가 — ①터치에서는 뜨지 않고 ②`**강조**` 의 별표가 날것으로
//    노출된다(title 은 plain text 다). definition 이 사실상 안 보이는 게 caveat 이 늘 보이는 것보다
//    큰 문제였다 — 그래서 뒤집었다. 두 화면 모두 `title` 을 버렸다.
//
// ⚠️ BlockNote(2층 각주)는 여기 합치지 않는다 — 그쪽은 className 없이 고정 스타일(11px·white/35·
//    mt-2)로 **의도적으로 잠가둔** 각주 전용이고, 여긴 읽으라고 펼치는 본문이다. 같은 원천
//    (`splitEmphasis`)만 공유한다.

import { Fragment } from "react";
import type { MetricDef } from "@/lib/admin-metrics";
import { STATUS } from "@/lib/admin/colors";
import { splitEmphasis } from "@/lib/text-emphasis";

/**
 * `**강조**` 를 <strong> 으로. 🔴 정규식을 다시 쓰지 않는다 — 짝 안 맞는 `**` 의 리터럴 유지
 * 같은 경계가 계약 테스트가 붙은 `splitEmphasis`(lib/text-emphasis.ts)에 잠겨 있다.
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

/** 라벨 옆의 `?`. open 상태는 카드가 들고 여기는 표시만 한다. */
export function InfoToggle({
  label,
  open,
  onToggle,
}: {
  /** 스크린리더용 — "<label> 정의" 로 읽힌다. */
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      // 🔴 `aria-controls` 는 안 단다 — 패널은 닫히면 **언마운트**돼서 id 가 사라지고,
      //    aria-controls 가 없는 요소를 가리키게 된다. 같은 기능의 리포 선례 둘
      //    (Drilldown.tsx · fortune/CollapsibleSection.tsx)도 aria-expanded 만 쓴다.
      aria-label={`${label} 정의`}
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
  );
}

/**
 * 펼쳐진 정의 패널. 카드 **안쪽 맨 아래**에 in-flow 로 놓는다.
 *
 * 🔴 absolute 팝오버가 아닌 이유 — 읽을 만한 폭의 팝오버는 2칸 그리드의 왼쪽 열에서 뷰포트를
 *    넘긴다(375px 에서 x ≈ −78px 로 실측). in-flow 면 카드가 세로로 늘어날 뿐 넘칠 데가 없다.
 *
 * 🔴 `break-words` 가 없으면 가로 스크롤이 난다 — definition/caveat 에 `recharge_payment_started`
 *    `admin_star_spend_breakdown` 같은 공백 없는 ASCII 토큰이 섞여 있고, 2칸 그리드(375px)든
 *    6칸 그리드(lg)든 카드 안쪽 폭은 그보다 좁다. 한글은 알아서 접히지만 이런 토큰은 안 접힌다.
 */
export function InfoPanel({ def }: { def: MetricDef }) {
  return (
    <div className="mt-2.5 space-y-1.5 rounded-lg bg-black/25 p-2.5 text-[11px] leading-snug break-words">
      <div className="text-white/70">
        <Emph text={def.definition} />
      </div>
      {def.caveat && (
        <div className="text-white/45">
          <Emph text={def.caveat} />
        </div>
      )}
      {/* 현 구현이 정의와 다르다는 사실은 숫자를 읽기 전에 알아야 한다 — 숨기면 그 값이
          맞는 것처럼 읽힌다. 지금 이 패널을 쓰는 지표 중엔 drift 가 있는 것이 없다. */}
      {def.drift && (
        <div style={{ color: STATUS.warning }}>
          <Emph text={def.drift} />
        </div>
      )}
    </div>
  );
}
