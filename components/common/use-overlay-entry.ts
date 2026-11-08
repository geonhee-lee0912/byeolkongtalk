"use client";

// 겹창을 스택(lib/app-shell/overlay-stack)에 한 번만 올린다 — 뒤 화면 스크롤 잠금 · ESC · (4단계) 안드로이드 뒤로 버튼이 맨 위 하나만 닫는다.
// Sheet·Dialog 가 쓰고, 틀에 안 맞는 겹창(거의 전체 화면 무대 등)은 이것만 직접 쓴다.
// close·dismissible 은 ref 로 최신값을 읽는다 — 처리 중 상태가 바뀔 때 다시 올리면 아래 창이 맨 위로 바뀌기 때문
import { useEffect, useRef } from "react";
import { overlayStack } from "@/lib/app-shell/overlay-stack";

export function useOverlayEntry(close: () => void, dismissible: boolean): void {
  const ref = useRef({ close, dismissible });
  useEffect(() => {
    ref.current = { close, dismissible };
  });
  useEffect(
    () =>
      overlayStack.push({
        close: () => ref.current.close(),
        canDismiss: () => ref.current.dismissible,
      }),
    [],
  );
}

/** 부모가 닫기를 거절했는지 볼 때까지의 여유 — onClose 뒤 이만큼 지나도 창이 남아 있으면 거절로 본다 */
export const REARM_MS = 150;

/** 마운트돼 있는지 — 닫기 뒤 창이 남았는지 확인용 */
export function useMountedRef() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
