"use client";

// components/byeolmaru/WooriSubjectBridge.tsx — ?subject= 를 읽어 WooriTodayView 에 넘기는 얇은 다리.
// SajuDateBridge(?date=) 와 동일 이유로 분리한다 — useSearchParams 는 클라 훅이고 Suspense 경계를
// 요구한다. 뷰 자체를 클라로 바꾸는 대신 다리 하나만 클라로 둬서 경계를 좁게 유지한다.
// 🔴 형태 검증(UUID 인지)만으로 끝내지 않는다 — "실제 내 상대인지"는 여기서 판단할 수 없다
//    (partners 목록이 없다). 그 검증은 WooriTodayView 가 loadPartners 응답과 대조해서 한다
//    (I-2 리뷰) — 여기서 걸러도 안 걸러도 최종 안전망은 거기 있으므로 그대로 통과시킨다.
import { useSearchParams } from "next/navigation";
import WooriTodayView from "./WooriTodayView";

export default function WooriSubjectBridge() {
  const subject = useSearchParams().get("subject");
  return <WooriTodayView initialSubject={subject ?? undefined} />;
}
