// 리프레시 토큰 보관 — 기기 보안 저장소(iOS 키체인·안드로이드 Keystore). 액세스 토큰은 저장하지 않는다(메모리 — session.ts).
import * as SecureStore from "expo-secure-store";
import type { TokenStore } from "./session.ts";

const KEY = "byeolkong.refreshToken";

export const secureTokenStore: TokenStore = {
  getRefresh: () => SecureStore.getItemAsync(KEY),
  // _THIS_DEVICE_ONLY: 백업·기기 이전으로 같은 토큰이 두 기기에 생기면 한쪽 교체 뒤 다른 쪽이 '재사용'으로 판정돼 둘 다 로그아웃된다
  setRefresh: (token) => SecureStore.setItemAsync(KEY, token, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
