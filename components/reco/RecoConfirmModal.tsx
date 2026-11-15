"use client";

// 인챗 추천 카드 탭 후 뜨는 확인 시트 — 별 확인창처럼 가운데 정렬 + 위에 상품 그림(디자인 다듬기 묶음 2 B안, 운영자 11-15).
// 글은 반말·어디로 가는지를 버튼까지 밝힌다. 포털·배경막·ESC·스크롤 잠금은 공통 Sheet.
import Sheet from "@/components/common/Sheet";
import OverlayCloseButton from "@/components/common/OverlayCloseButton";
import Icon from "@/components/common/Icon";
import type { RecoProduct } from "@/lib/reco-utils";
import { RECO_DISPLAY } from "@/lib/reco-utils";

interface Props {
  open: boolean;
  product: RecoProduct | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function RecoConfirmModal({
  open,
  product,
  onCancel,
  onConfirm,
}: Props) {
  if (!open || !product || typeof document === "undefined") return null;

  const display = RECO_DISPLAY[product];
  if (!display) return null;
  const dest = display.target === "tarot" ? "타로" : "사주";
  const title = `이 대화 마무리하고 ${dest}로 넘어갈까?`;

  return (
    <Sheet label={title} onClose={onCancel} z={100}>
      <div className="flex flex-col items-center text-center">
        <span className="w-14 h-14 rounded-2xl bg-lilac-soft flex items-center justify-center mb-2 text-eye-purple">
          {display.iconSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={display.iconSrc} alt="" className="w-11 h-11 object-contain" />
          ) : (
            <Icon name="sparkle" size={28} />
          )}
        </span>
        <p className="font-display text-17 text-eye-purple break-keep">{title}</p>
        <p className="text-13 text-text-light mt-1 leading-relaxed break-keep">
          지금 대화는 별콩이가 정리해서 닫아둘게. 더 하고 싶으면 계속해도 돼.
        </p>
      </div>
      <button type="button" onClick={onConfirm} className="btn btn-primary btn-lg mt-5">
        마무리하고 {dest} 보러 가기
      </button>
      <OverlayCloseButton className="btn btn-text btn-lg mt-1.5">아니, 대화 더 할래</OverlayCloseButton>
    </Sheet>
  );
}
