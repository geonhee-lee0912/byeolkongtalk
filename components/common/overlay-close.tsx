"use client";

// 겹창 안쪽 버튼(나중에·확인 등)이 부르는 닫기 요청 — Sheet 는 앱에서 내려가는 움직임을 끝낸 뒤 onClose 를 부르고,
// Dialog 와 웹은 바로 부른다. Sheet·Dialog 밖에서 부르면 아무 일도 없다
import { createContext, useContext } from "react";

export const OverlayCloseContext = createContext<() => void>(() => {});

export function useOverlayClose(): () => void {
  return useContext(OverlayCloseContext);
}
