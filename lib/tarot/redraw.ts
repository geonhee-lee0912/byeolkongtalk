// 결과 화면 '이 고민 다시 뽑기' — 이 결과의 고민을 넘겨 스프레드 고르기로 보낸다.
// 예전엔 /tarot 로만 보내 탭에 남은 마지막 고민을 썼다 — 새 탭·앱 재실행·보관함에서 연 결과에선 비어 홈으로 튕겼다
// (디자인 다듬기 /tarot/result 운영자 '남기고 고치자' 11-14). 스프레드 고르기는 태그가 있어야 해서, 모르면 고민 적기로.
import { normalizeEmotionTag, type PendingConsultation } from "@/lib/emotions";

export function redrawTarget(
  question: string,
  emotionTag: string | null
): { href: string; pending: PendingConsultation | null } {
  const emotion = normalizeEmotionTag(emotionTag);
  const concern = question.trim();
  if (!emotion || !concern) return { href: "/concern", pending: null };
  return { href: "/tarot", pending: { emotion, concern, type: "tarot" } };
}
