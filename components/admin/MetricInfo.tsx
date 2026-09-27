"use client";

// components/admin/MetricInfo.tsx — 지표 정의를 띄우는 `?` 버튼과 그 툴팁(팝오버). 공용.
//
// 🔴 왜 공용인가 — 같은 `?`/툴팁을 Metric(1층 지표 카드)과 GuardrailRow(가드레일 6칸)가 쓴다.
//    사본을 두면 갈린다. 이 워크스트림이 이미 두 번 물린 클래스다(라우트 note 와 레지스트리의
//    drift, 같은 필터가 두 RPC 에 복제된 부채). 위치 계산·닫기·표기를 여기 한 곳에 잠근다.
//
// 🔴 왜 카드가 커지는 게 아니라 **위에 뜨나** — 툴팁은 카드 폭에 맞출 이유가 없다. 카드에
//    left-0/right-0 로 앵커를 걸면 108px 칸에서 뷰포트를 넘지만, **뷰포트 기준으로 계산해
//    좌우를 클램프**하면 108px 칸에서도 280px 툴팁이 정상으로 뜬다. 카드를 늘리면 읽는 동안
//    표가 밀려 비교가 깨진다 — 그게 이 화면의 쓰임이다.
//
// 🔴 왜 네이티브 title 이 아닌가 — ①터치에서는 뜨지 않고 ②`**강조**` 의 별표가 날것으로
//    노출된다(title 은 plain text 다). 두 화면 모두 `title` 을 버렸다.
//
// ⚠️ BlockNote(2층 각주)는 여기 합치지 않는다 — 그쪽은 className 없이 고정 스타일로 **의도적으로
//    잠가둔** 각주 전용이다. 같은 원천(`splitEmphasis`)만 공유한다.

import { Fragment, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MetricDef } from "@/lib/admin-metrics";
import { STATUS } from "@/lib/admin/colors";
import { placePopover } from "@/lib/admin/popover";
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

/**
 * 툴팁에 들어가는 **내용만**. 위치 계산과 분리해 둔 이유: 이쪽은 DOM 없이 렌더해 전수 대조할 수
 * 있어야 한다(좌표는 SSR 로 못 재지만 문구·강조·색은 잴 수 있다).
 */
export function InfoContent({ def }: { def: MetricDef }) {
  return (
    <>
      <div className="text-white/70">
        <Emph text={def.definition} />
      </div>
      {def.caveat && (
        <div className="text-white/45">
          <Emph text={def.caveat} />
        </div>
      )}
      {/* 현 구현이 정의와 다르다는 사실은 숫자를 읽기 전에 알아야 한다 — 숨기면 그 값이
          맞는 것처럼 읽힌다. 지금 이 툴팁을 쓰는 지표 중엔 drift 가 있는 것이 없다. */}
      {def.drift && (
        <div style={{ color: STATUS.warning }}>
          <Emph text={def.drift} />
        </div>
      )}
    </>
  );
}

export function MetricInfo({ def, label }: { def: MetricDef; label: string }) {
  const [open, setOpen] = useState(false);
  // null = 아직 위치를 못 잰 상태. 그 프레임은 visibility:hidden 으로 감춘다(좌상단 번쩍임 방지).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  const place = useCallback(() => {
    const btn = btnRef.current;
    const pop = popRef.current;
    if (!btn || !pop) return;
    const b = btn.getBoundingClientRect();
    const { width, height } = pop.getBoundingClientRect();
    setPos(
      placePopover(b, { width, height }, {
        // 🔴 innerWidth 가 아니라 clientWidth — innerWidth 는 스크롤바를 포함해서, 데스크톱에서
        //    오른쪽 끝 칸의 툴팁이 스크롤바 폭만큼 잘린다.
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      })
    );
  }, []);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    // 🔴 useLayoutEffect 가 아니다 — 클라이언트 컴포넌트는 서버에서도 한 번 렌더되고 거기서
    //    useLayoutEffect 는 React 경고를 낸다. 위치를 재기 전 프레임은 visibility 로 감추므로
    //    paint 이후에 재도 번쩍임이 없다.
    place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btnRef.current?.focus(); // 닫으면 포커스를 버튼으로 돌려준다
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      // 🔴 제 버튼은 제외한다 — 여기서 닫아버리면 뒤이은 onClick 이 다시 열어 토글이 안 먹는다.
      //    그리고 **이 핸들러가 "한 번에 하나만" 을 공짜로 준다**: 다른 카드의 `?` 를 누르면
      //    그 pointerdown 이 이 툴팁에겐 바깥 클릭이라 먼저 닫히고, 그 다음 click 이 저쪽을 연다.
      //    별도 레지스트리를 두지 말 것.
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    // scroll 은 capture — 중첩 스크롤 컨테이너에서 일어난 스크롤도 잡아 위치를 다시 잰다.
    // (닫지 않고 따라가게 한다. 읽는 도중 살짝 스크롤했다고 사라지면 모바일에서 특히 나쁘다.)
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        // 🔴 `aria-controls` 는 안 단다 — 툴팁은 닫히면 **언마운트**돼서 id 가 사라지고,
        //    없는 요소를 가리키게 된다. 같은 기능의 리포 선례 둘(Drilldown.tsx ·
        //    fortune/CollapsibleSection.tsx)도 aria-expanded 만 쓴다.
        // ⚠️ `aria-describedby` 는 반대로 **달아도 안전하다** — 삼항이라 닫히면 속성 자체가
        //    사라져서 가리킬 id 가 없는 순간이 없다. 이게 필요한 이유: 네이티브 `title` 을
        //    버리면서(위 주석) 스크린리더가 정의에 닿을 경로도 같이 없어졌다. 버튼 이름은
        //    "… 정의"라고만 말하고 정작 정의는 안 읽힌다.
        aria-describedby={open ? popId : undefined}
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
      {open &&
        createPortal(
          <div
            ref={popRef}
            id={popId}
            role="tooltip"
            // 🔴 body 로 포털 — fixed 는 transform/filter 를 가진 조상이 있으면 그 조상에
            //    갇힌다. 어드민 레이아웃엔 지금 그런 조상이 없지만(AdminMobileNav 가 같은
            //    사실에 기대 포털 없이 fixed 를 쓴다), 그건 **읽어서 내린 판정**이고 CSS 한 줄로
            //    조용히 깨진다. 포털은 그 판정 자체를 필요 없게 만든다.
            // 🔴 그 대가로 어드민 레이아웃의 `bg-night text-white` 밖으로 나간다 — body 색은
            //    사용자 화면용 eye-purple 이라 배경·글자색을 여기서 **다시 명시**해야 한다.
            style={{
              position: "fixed",
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              // 🔴 폭·높이는 Tailwind arbitrary 대신 style 로 — 이 코드베이스는 "클래스가 안
              //    만들어져 조용히 사라지는" 클래스의 사고를 이미 겪었다. 인라인은 그럴 일이 없다.
              width: "min(280px, calc(100vw - 24px))",
              maxHeight: "calc(100vh - 24px)",
              visibility: pos ? undefined : "hidden",
              zIndex: 60,
            }}
            // 🔴 `break-words` 는 유지 — definition/caveat 에 `recharge_payment_started`
            //    같은 공백 없는 ASCII 토큰이 섞여 있다. 한글은 접히지만 이런 토큰은 안 접힌다.
            className="space-y-1.5 overflow-y-auto rounded-lg border border-white/15 bg-night-deep p-2.5 text-[11px] leading-snug text-white shadow-xl break-words"
          >
            <InfoContent def={def} />
          </div>,
          document.body
        )}
    </>
  );
}
