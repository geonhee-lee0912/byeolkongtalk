"use client";

// 앱 안인지. 하이드레이션 첫 그림은 서버와 같아야 해서(서버는 앱인지 모른다) 그때만 ready=false · app=null 로 그리고 곧바로 다시 그린다.
// 화면 이동으로 새로 열리는 화면은 처음부터 앱 정보를 받는다 — 예전(마운트 뒤 effect 로 읽기)엔 매번 한 박자 늦어, 화면 기억으로
// 바로 그린 마이에서 '알림 설정' 줄이 뒤늦게 생기며 아래를 밀었다(2026-11-08 아이폰 실기기 '깜빡임'). 앱 정보는 페이지 수명 동안 안 바뀐다.
import { useSyncExternalStore } from "react";
import { getAppInfo } from "./app-context.ts";
import type { AppInfo } from "./app-bridge/protocol.ts";

type AppInfoState = { ready: boolean; app: AppInfo | null };

const SERVER: AppInfoState = { ready: false, app: null };
let client: AppInfoState | null = null;
// 같은 값을 돌려줘야 한다(매번 새 객체면 React 가 바뀐 줄 알고 끝없이 다시 그린다)
const getSnapshot = (): AppInfoState => (client ??= { ready: true, app: getAppInfo() });
const getServerSnapshot = (): AppInfoState => SERVER;
const subscribe = () => () => {};

export function useAppInfo(): AppInfoState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
