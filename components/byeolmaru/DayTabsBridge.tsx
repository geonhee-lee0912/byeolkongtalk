"use client";

// components/byeolmaru/DayTabsBridge.tsx — ?date= ?tab= 을 읽어 DayTabsView 에 넘기는 얇은 다리.
// 🔴 페이지(서버 컴포넌트)가 직접 못 읽는다 — useSearchParams 는 클라 훅이고 Suspense 경계를
//    요구한다. 다리 하나만 클라로 둬서 경계를 좁게 유지한다(SajuDateBridge 선례).
import { useSearchParams } from "next/navigation";
import { parseDayTab } from "@/lib/byeolmaru/day-tabs";
import DayTabsView from "./DayTabsView";

export default function DayTabsBridge() {
  const sp = useSearchParams();
  const date = sp.get("date");
  // "2026-09-05" 모양만 통과시킨다 — 임의 문자열이 선택 상태로 들어가면 cell 폴백이 탄다.
  const ok = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  return <DayTabsView initialDate={ok} initialTab={parseDayTab(sp.get("tab"))} />;
}
