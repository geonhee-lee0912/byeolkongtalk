"use client";

// components/byeolmaru/useBaitDismiss.ts — 미끼 당일 접힘(스펙 §9 "거절하면 그날은 접힌다").
// 🔴 slot 별로 접는다 — 자리마다 다른 물건이라 하나를 닫았다고 나머지까지 닫으면 과하다.
// 저장소는 localStorage: 이건 "이 사람 이 기기에서 오늘 한 번 거절했다"는 per-viewer 편의라
// 서버에 둘 값이 아니다. 쿠키·storage prefix 는 이 저장소 관례대로 byeolkong_.
// ⚠️ 사파리 프라이빗 등에서 접근 자체가 throw 할 수 있어 읽기·쓰기를 전부 try/catch 로 감싼다.
import { useEffect, useState } from "react";
import type { BaitSlot } from "@/lib/byeolmaru/bait";

const KEY = "byeolkong_bait_dismissed";

/** KST 오늘 "YYYY-MM-DD" — 서버를 안 부른다(접힘은 개인화가 아니라 편의라 기기 시각으로 충분). */
function todayKst(): string {
  const kst = new Date(Date.now() + 9 * 3600_000);
  return kst.toISOString().slice(0, 10);
}

function read(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function useBaitDismiss(slot: BaitSlot): { dismissed: boolean; dismiss: () => void } {
  // 🔴 초기값을 null 로 두고 effect 에서 읽는다 — localStorage 는 서버에 없어서, 초기 렌더에
  //    읽으면 하이드레이션 불일치가 난다.
  // 🔴 "어느 slot 의 값인지"를 같이 들고 있는다 — PremiumBlock 은 slot 이 바뀌어도 언마운트되지
  //    않아(허브 인연 칩 토글), slot 만 보고 있으면 바뀐 첫 프레임에 이전 slot 의 접힘이 새어
  //    엉뚱한 미끼가 깜빡 사라진다(T4 리뷰 발견). 아직 모르는 동안은 접지 않는 쪽으로 떨어뜨린다.
  const [readFor, setReadFor] = useState<{ slot: BaitSlot; dismissed: boolean } | null>(null);

  useEffect(() => {
    setReadFor({ slot, dismissed: read()[slot] === todayKst() });
  }, [slot]);

  // readFor 가 지금 slot 것이 아니면(막 바뀐 직후 등) "아직 모름" → 접지 않는다(보수적 기본값).
  const dismissed = readFor?.slot === slot ? readFor.dismissed : false;

  function dismiss() {
    setReadFor({ slot, dismissed: true });
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...read(), [slot]: todayKst() }));
    } catch {
      /* 저장에 실패해도 이번 세션 동안은 접힌 상태가 유지된다 — 그걸로 충분하다 */
    }
  }

  return { dismissed, dismiss };
}
