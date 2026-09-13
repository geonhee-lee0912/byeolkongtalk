"use client";

// components/byeolmaru/SajuDateBridge.tsx — ?date= 를 읽어 SajuTodayView 에 넘기는 얇은 다리.
// 🔴 페이지(서버 컴포넌트)가 직접 못 읽는다 — useSearchParams 는 클라 훅이고 Suspense 경계를
//    요구한다. 뷰 자체를 클라로 바꾸는 대신 다리 하나만 클라로 둬서 경계를 좁게 유지한다.
import { useSearchParams } from "next/navigation";
import SajuTodayView from "./SajuTodayView";

export default function SajuDateBridge() {
  const date = useSearchParams().get("date");
  // "2026-09-05" 모양만 통과시킨다 — 임의 문자열이 선택 상태로 들어가면 cell 폴백이 탄다.
  const ok = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  return <SajuTodayView initialDate={ok} />;
}
