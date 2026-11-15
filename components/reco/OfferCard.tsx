"use client";

// 대화 속 제안 카드 한 줄 + 그 위 구분선 — '카드 한 장 더 뽑기'·'별콩이랑 더 얘기하기'·다른 상품 추천이 같은 모양
// (디자인 다듬기 묶음 2 대화 속 칩 A안 + 글자 있는 선, 운영자 11-15). 결과 화면 '다음엔 뭐 볼래?' 카드와 같은 줄:
// 아이콘 칸 · 제목 + 알약 · 한 줄 설명 · ›. 별콩이 말풍선과 구분선으로 떼어 별콩이 말이 아닌 고를 거리임을 보인다.
import type { ReactNode } from "react";
import Icon from "@/components/common/Icon";

export function OfferDivider() {
  return (
    <div className="mt-3.5 mb-0.5 ml-10 max-w-xs flex items-center gap-2" aria-hidden>
      <span className="flex-1 h-px bg-lilac-mid/45" />
      <span className="text-11 text-text-light">더 볼 수 있어</span>
      <span className="flex-1 h-px bg-lilac-mid/45" />
    </div>
  );
}

export default function OfferCard({
  icon,
  title,
  badge,
  sub,
  onTap,
  disabled,
  done,
}: {
  /** 아이콘 칸 안 그림(webp 경로) 또는 면 아이콘 */
  icon: { src: string } | { node: ReactNode };
  title: string;
  /** 제목 옆 알약 — 값('별 10')이나 종류('사주') */
  badge?: string;
  sub: string;
  onTap: () => void;
  /** 잠금 — 답이 나오는 동안·다른 구매 중엔 흐리게 */
  disabled?: boolean;
  /** 이미 산 뒤 — 회색 한 줄, 누를 수 없음 */
  done?: boolean;
}) {
  return (
    <div className="mt-2 mb-1 ml-10 max-w-xs">
      <button
        type="button"
        onClick={done || disabled ? undefined : onTap}
        disabled={done || disabled}
        className={`card p-3 w-full flex items-center gap-3 text-left transition ${
          done ? "cursor-default" : disabled ? "opacity-60 cursor-not-allowed" : "active:scale-[0.98]"
        }`}
      >
        <span className="w-10 h-10 rounded-xl bg-lilac-soft flex items-center justify-center shrink-0 text-eye-purple">
          {"src" in icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon.src} alt="" className="w-8 h-8 object-contain" />
          ) : (
            icon.node
          )}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className={`text-14 font-bold truncate ${done ? "text-text-light" : "text-eye-purple"}`}>{title}</span>
            {badge && !done && (
              <span className="text-11 font-bold text-accent bg-lilac-soft/60 px-1.5 py-0.5 rounded-full shrink-0">{badge}</span>
            )}
          </span>
          <span className="block text-12 text-text-light mt-0.5 leading-snug">{sub}</span>
        </span>
        {!done && <Icon name="chev_r" size={16} className="text-lilac-mid" />}
      </button>
    </div>
  );
}
