// /fortune/daily 은퇴(별마루 개편 Phase 2) — 유저별 LLM 오늘의 운세 폐지. 무료 오늘 사주는
// 별마루 룰 버전이 대체하므로, 옛 링크·북마크를 별마루 허브로 착지시킨다(허브가 로그인 게이트 처리).
import { redirect } from "next/navigation";

export default function FortuneDailyRetired() {
  redirect("/byeolmaru");
}
