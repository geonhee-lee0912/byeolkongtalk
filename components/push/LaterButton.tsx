"use client";

// 알림 시트의 '나중에' — 공통 시트에 닫기를 요청한다(앱에선 내려간 뒤 시트의 onClose 가 불린다). Sheet 안에서만 쓴다
import { useOverlayClose } from "@/components/common/overlay-close";

export default function LaterButton({ disabled }: { disabled: boolean }) {
  const close = useOverlayClose();
  return (
    <button type="button" disabled={disabled} onClick={close} className="block w-full mt-1.5 py-2.5 text-[13px] font-bold text-lilac-deep">
      나중에
    </button>
  );
}
