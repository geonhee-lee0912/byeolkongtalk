// 결과 화면 '이 고민 다시 뽑기' — 이 결과의 고민을 넘겨 스프레드 고르기로 보낸다.
// 예전엔 /tarot 로만 보내 탭에 남은 마지막 고민을 썼다 — 새 탭·앱 재실행·보관함에서 연 결과에선 비어 홈으로 튕겼다
// (디자인 다듬기 /tarot/result 운영자 '남기고 고치자' 11-14). 스프레드 고르기는 태그가 있어야 해서, 모르면 고민 적기로.
import { normalizeEmotionTag, type PendingConsultation } from "@/lib/emotions";
import type { CrossCard } from "@/components/upsell/cross-cards";

export function redrawTarget(
  question: string,
  emotionTag: string | null
): { href: string; pending: PendingConsultation | null } {
  const emotion = normalizeEmotionTag(emotionTag);
  const concern = question.trim();
  if (!emotion || !concern) return { href: "/concern", pending: null };
  return { href: "/tarot", pending: { emotion, concern, type: "tarot" } };
}

// 결과 화면에선 따로 선 보라 버튼이 아니라 추천 묶음 맨 위 카드로 둔다 — 같은 무게(M2, 운영자 11-14).
// 아이콘·바탕은 운세 결과의 '타로로 고민 상담' 카드와 같다.
export function redrawCard(href: string, minPrice: number): CrossCard {
  return {
    href,
    emoji: "",
    iconSrc: "/icons/fortune/tarot_counsel.webp",
    label: "이 고민으로 카드 다시 뽑기",
    tagline: "고민은 그대로, 리딩 방법만 다시 골라",
    badge: `별 ${minPrice}부터`,
    gradient: "#EFEAF6",
  };
}
