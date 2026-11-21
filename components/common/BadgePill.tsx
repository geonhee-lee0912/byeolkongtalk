// 제목 옆 연보라 알약 — 값('별 10'·'별 10부터')이나 종류('무료'·'타로'·'사주').
// 가격은 앱 전체가 '✦숫자'(사주 운세 탭·시작 화면·고르기 페이지)라 '별 N' 글자를 별 그림 + 숫자로 그린다
// (디자인 다듬기 운세 결과 ⑧ S2, 운영자 11-21 — 결과 화면 '다음엔 뭐 볼래?' 카드와 대화 속 제안 카드).
import Icon from "@/components/common/Icon";

/** '별 N(뒷말)' 이면 숫자와 뒷말, 아니면 null(글자 그대로 그린다) */
export function splitStarBadge(badge: string): { cost: string; rest: string } | null {
  const m = badge.match(/^별 (\d+)(.*)$/);
  return m ? { cost: m[1], rest: m[2] } : null;
}

export default function BadgePill({ badge }: { badge: string }) {
  const star = splitStarBadge(badge);
  return (
    <span className="text-11 font-bold text-accent bg-lilac-soft/60 px-1.5 py-0.5 rounded-full shrink-0">
      {star ? (
        <>
          <Icon name="star" size={14} className="inline align-[-2px] mr-0.5" />
          {star.cost}
          {star.rest}
        </>
      ) : (
        badge
      )}
    </span>
  );
}
