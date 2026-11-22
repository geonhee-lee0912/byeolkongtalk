// 고르기 페이지 맨 위 '무엇을 사는지' 한 줄 — 상품 그림 · 이름 · ✦값 · 분량·시간.
// 사주 고르기(/fortune/[type]/buy)와 궁합 고르기(/fortune/compat{,-social}/buy)가 같이 쓴다(디자인 다듬기 묶음 4, 11-16).
import { FortuneIcon } from "@/components/fortune/FortuneIcon";
import Icon from "@/components/common/Icon";
import { FORTUNE_CONFIG, FORTUNE_GRADIENTS, FORTUNE_LENGTH_HINT, type FortuneType } from "@/lib/fortune/types";
import { FORTUNE_LANDING } from "@/data/fortune/landing";
import type { LandingKey } from "@/lib/fortune/outline";

export default function BuyProductRow({ type }: { type: FortuneType }) {
  const cfg = FORTUNE_CONFIG[type];
  const copy = FORTUNE_LANDING[type as LandingKey];
  const meta = [FORTUNE_LENGTH_HINT[type], copy?.minutes].filter(Boolean).join(" · ");
  return (
    <div className="w-full max-w-md mx-auto px-5 pt-4">
      <div className="card px-4 py-3 flex items-center gap-3">
        <span
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: FORTUNE_GRADIENTS[type] }}
        >
          <FortuneIcon type={type} size={36} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-14 font-bold text-eye-purple">{cfg.label}</span>
          <span className="flex items-center text-12 text-text-light mt-0.5 tabular-nums">
            <Icon name="star" size={13} className="mr-0.5" />
            {cfg.cost}
            {meta && <> · {meta}</>}
          </span>
        </span>
      </div>
    </div>
  );
}
