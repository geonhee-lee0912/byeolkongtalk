"use client";

// components/byeolmaru/MonthGridSection.tsx — 월간 격자 접이식 래퍼(스펙 §2-2).
// 별마루는 실사용 데이터가 0이라 "사람들이 한 달을 훑는가"를 아무도 모른다. 항상 펼침은 그 가설에
// 370px 를 선지불하는 것이고 폐지는 확인할 기회를 없앤다 → **접힘 클릭률로 답을 얻는다**.
// 🔴 채움 서사("N칸 열림")를 이 버튼이 지고 간다. **AttendanceStrip 은 아직 같은 문구를 쓰고 있다** —
//    허브를 재조립하는 태스크가 거기서 그 줄을 걷어내야 두 자리에 같은 말이 동시에 뜨지 않는다.
//    (이 컴포넌트가 아직 허브에 안 붙어 있어 지금은 중복이 화면에 안 보인다.)
import { useEffect, useState } from "react";
import { trackUiEvent } from "@/lib/analytics/ui-events";

const KEY = "byeolkong_month_grid_seen";

interface Props {
  /** 이번 달 열린 칸 수 — 버튼 문구의 N. */
  filledDays: number;
  children: React.ReactNode;
}

export default function MonthGridSection({ filledDays, children }: Props) {
  // 🔴 null 로 시작해 effect 에서 정한다 — localStorage 는 서버에 없어 초기 렌더에 읽으면
  //    하이드레이션 불일치가 난다(useBaitDismiss 와 같은 이유). 허브는 어차피 캘린더를 fetch 한
  //    뒤에 이 자리를 그리므로 실제로는 깜빡임이 보이지 않는다.
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(KEY) === "1";
    } catch {
      /* 프라이빗 창 등 — 못 읽으면 "첫 방문"으로 떨어뜨린다(한 번 펼쳐 보여주는 쪽이 안전) */
    }
    setOpen(!seen); // 첫 방문만 펼친 상태로 시작
  }, []);

  function toggle() {
    const next = !(open ?? false);
    setOpen(next);
    trackUiEvent("byeolmaru_month_grid_toggled", { meta: { open: next } });
    try {
      localStorage.setItem(KEY, "1"); // 한 번이라도 손대면 그 뒤로는 접힌 채 시작한다
    } catch {
      /* 저장 실패해도 이번 세션 동안은 유지된다 */
    }
  }

  return (
    <section className="space-y-2">
      {/* 🔴 자체 배경이 없다 — 허브가 이 섹션을 크림 판 안에 넣기 때문이다(스펙 §2). 같은 크림
          박스를 또 그리면 판 위에 같은 색 상자가 겹쳐 경계가 지저분해진다. 행 전체가 탭 타깃이라
          배경 없이도 누를 곳은 분명하다(w-full + py-2). */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open ?? false}
        className="flex w-full items-center justify-between py-2 text-left"
      >
        <span className="text-sm font-medium text-eye-purple">
          이번 달 전체 보기 · {filledDays}칸 열림
        </span>
        <span aria-hidden className="text-xs text-text-light">{open ? "▴" : "▾"}</span>
      </button>
      {open ? children : null}
    </section>
  );
}
