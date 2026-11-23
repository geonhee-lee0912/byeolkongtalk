"use client";

// 화면이 올린 헤더 버튼(lib/header-action) — 금색 알약. 앱 헤더(‹ 제목 오른쪽)와 웹 헤더(잔액 왼쪽)가 같이 쓴다.
// 대화 속 금색 '결과 카드 보기' 칩과 같은 색 — 디자인 다듬기 /tarot/reading ⑦ 운영자 K5안 11-13
import { useSyncExternalStore } from "react";
import { getHeaderAction, subscribeHeaderAction } from "@/lib/header-action";

export function useHeaderAction() {
  return useSyncExternalStore(subscribeHeaderAction, getHeaderAction, () => null);
}

export default function HeaderActionButton() {
  const action = useHeaderAction();
  if (!action) return null;
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className="h-8 px-3 rounded-full bg-gold text-night text-13 font-bold whitespace-nowrap transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {action.label}
    </button>
  );
}
