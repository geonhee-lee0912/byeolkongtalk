"use client";

// components/byeolmaru/TarotDateBridge.tsx — ?date= 를 읽어 TarotTodayView 에 넘기는 얇은 다리.
// 🔴 SajuDateBridge 와 같은 이유·같은 모양이다 — useSearchParams 는 클라 훅이라 Suspense 경계를
//    요구한다. 뷰 전체를 클라 경계에 담그는 대신 다리 하나만 클라로 둬서 경계를 좁게 유지한다.
import { useSearchParams } from "next/navigation";
import TarotTodayView from "./TarotTodayView";

export default function TarotDateBridge() {
  const date = useSearchParams().get("date");
  // "2026-09-05" 모양만 통과시킨다 — 임의 문자열이 그대로 흘러가면 두 라우트가 400 을 준다.
  const ok = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  return <TarotTodayView initialDate={ok} />;
}
