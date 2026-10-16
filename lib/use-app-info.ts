"use client";

// 앱 안인지 — 하이드레이션 어긋남을 피하려고 마운트 뒤에 읽는다(첫 렌더는 ready=false · app=null).
import { useEffect, useState } from "react";
import { getAppInfo } from "./app-context.ts";
import type { AppInfo } from "./app-bridge/protocol.ts";

export function useAppInfo(): { ready: boolean; app: AppInfo | null } {
  const [state, setState] = useState<{ ready: boolean; app: AppInfo | null }>({ ready: false, app: null });
  useEffect(() => {
    setState({ ready: true, app: getAppInfo() });
  }, []);
  return state;
}
