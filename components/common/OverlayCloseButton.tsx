"use client";

// 겹창(Sheet·Dialog) 안의 취소·닫기 버튼 — onClose 를 바로 부르지 않고 틀에 닫기를 요청한다(앱에서 시트가 내려간 뒤 닫힘, 연타해도 한 번).
// Sheet·Dialog 의 children 안에서만 쓴다
import type { ButtonHTMLAttributes } from "react";
import { useOverlayClose } from "./overlay-close";

export default function OverlayCloseButton(props: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  const close = useOverlayClose();
  return <button type="button" {...props} onClick={close} />;
}
