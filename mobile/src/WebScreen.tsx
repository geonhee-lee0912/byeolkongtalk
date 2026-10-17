// 웹뷰 화면 — 링크 규칙·네이티브 로그인·웹 메시지·뒤로 가기·오프라인·딥링크. 스펙 2026-10-12-앱-1 §4·§5·§7.
// 앱 토큰은 웹에 절대 넘기지 않는다 — 웹뷰는 교환 코드로 받은 쿠키만 쓴다.
// 교환 코드는 주소가 아니라 source.headers 로 싣는다(handoffSource — 서버는 주소의 code 를 보지 않는다). 헤더는 앱이 연 그 첫 요청에만
// 실리고 웹뷰 안 이동엔 안 실린다 — 그래서 딥링크·일반 이동은 헤더 없이(plain) 열어도 남의 코드를 먹일 수 없다.
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Linking, Platform, StyleSheet, View } from "react-native";
import { WebView, type WebViewProps } from "react-native-webview";
import * as WebBrowser from "expo-web-browser";
import * as SplashScreen from "expo-splash-screen";
import { appUserAgentSuffix, parseWebToApp } from "../../lib/app-bridge/protocol.ts";
import { appInfo, config } from "./config";
import { decideNavigation, parseIntentUrl, type NavDecision } from "./linkRules.ts";
import { pathFromDeepLink } from "./deeplink.ts";
import { handoffSource, isOurUrl, resetUrl, withVercelBypass, type HandoffMode, type WebSource } from "./urls.ts";
import { createAuthSession } from "./auth/session.ts";
import { secureTokenStore } from "./auth/tokenStore";
import { authApi, isAuthError } from "./auth/api";
import { appleNativeLogin, kakaoNativeLogin, LoginCancelled } from "./auth/nativeLogin";
import OfflineView from "./OfflineView";

// 🔴 react-native-webview 14.0.1 의 타입 선언은 class WebView<P = undefined> extends Component<WebViewProps & P> 라 P 를 안 주면 props 가 never 가 된다
//    (ComponentProps<typeof WebView> 도 never) — 이벤트 타입은 패키지의 WebViewProps 에서 꺼내고, ref·JSX 에는 타입 인자 object 를 준다(WebView<object>)
type ShouldStartRequest = Parameters<NonNullable<WebViewProps["onShouldStartLoadWithRequest"]>>[0];
type MessageEvent = Parameters<NonNullable<WebViewProps["onMessage"]>>[0];
type OpenWindowEvent = Parameters<NonNullable<WebViewProps["onOpenWindow"]>>[0];
type ErrorEvent = Parameters<NonNullable<WebViewProps["onError"]>>[0];

SplashScreen.preventAutoHideAsync().catch(() => {});

const auth = createAuthSession({ store: secureTokenStore, api: authApi, isAuthError });
const UA_SUFFIX = appUserAgentSuffix(appInfo);
/** 로그인 연타 막기 — 이 시간 안에 다시 온 로그인 시작은 버린다(같은 로그인 화면이 두 번 뜨지 않게) */
const LOGIN_TAP_GUARD_MS = 1_000;
// 문서가 뜨기 전에 — 웹이 앱 안인지 판단하는 1차 근거(lib/app-context.ts). UA 꼬리가 2차
const INJECT_APP_INFO = `window.__BYEOLKONG_APP__=${JSON.stringify(appInfo)};true;`;
/** 헤더 없이 여는 주소 — 개발용 빌드의 우회 값은 주소에 단다(Vercel 이 우회 쿠키를 리다이렉트로 심는다). 교환 코드를 싣는 요청은 handoff() 로만 */
const plain = (url: string): WebSource => ({ uri: withVercelBypass(url, config.vercelBypass) });
/** 교환 코드로 웹뷰 쿠키 맞추기 — 코드는 헤더로. 개발용 빌드의 우회 값도 헤더로 달아 그 앞에 리다이렉트가 끼지 않게 한다(urls.ts handoffSource) */
const handoff = (code: string, next: string, mode: HandoffMode): WebSource =>
  handoffSource(config.baseUrl, code, next, mode, config.vercelBypass);

/** 앱 호출 주소를 OS 에 넘긴다. 안드로이드 intent: 는 RN Linking 이 직접 못 열어서 scheme 주소 → 대체 주소 순으로 */
async function openExternal(url: string): Promise<void> {
  const intent = Platform.OS === "android" ? parseIntentUrl(url) : null;
  const candidates = intent ? [intent.primary, intent.fallback] : [url];
  for (const c of candidates) {
    if (!c) continue;
    try {
      await Linking.openURL(c);
      return;
    } catch {
      // 다음 후보
    }
  }
}

export default function WebScreen() {
  const webRef = useRef<WebView<object>>(null);
  const [source, setSource] = useState<WebSource | null>(null);
  const [offline, setOffline] = useState(false);
  const canGoBack = useRef(false);
  const loadedOnce = useRef(false);
  // 네이티브 로그인 번호표 — 새 시도가 앞 시도를 대신한다. 끝나지 않은 앞 시도를 기다리는 잠금은 두지 않는다:
  // iOS 카카오톡에서 복귀 주소 없이 돌아오면('◀ 별콩톡'·앱 전환) kakaoNativeLogin 이 영영 끝나지 않아(auth/nativeLogin.ts) 잠금이면
  // 앱을 껐다 켤 때까지 로그인 버튼이 죽는다
  const loginTurn = useRef(0);
  const loginStartedAt = useRef(0);

  // 앱 실행 — 토큰 갱신 + 교환 코드로 웹뷰 쿠키를 맞춘다(스펙 §7-4). 딥링크로 열렸으면 그 경로로
  const boot = useCallback(async () => {
    const next = pathFromDeepLink(await Linking.getInitialURL(), config.scheme) ?? "/";
    const target = await auth.startTarget();
    setSource(
      target.kind === "handoff"
        ? handoff(target.code, next, "launch")
        : plain(target.kind === "reset" ? resetUrl(config.baseUrl, next) : config.baseUrl + next),
    );
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  // 앱이 떠 있을 때 들어온 딥링크
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      const path = pathFromDeepLink(url, config.scheme);
      if (path) setSource(plain(config.baseUrl + path)); // 헤더 없이 — 경로에 code 를 넣어 와도 서버가 보지 않는다
    });
    return () => sub.remove();
  }, []);

  // 안드로이드 뒤로 가기 — 웹뷰 기록이 있으면 뒤로, 없으면 OS 기본(앱 닫기)
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack.current) return false;
      webRef.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  const startNativeLogin = useCallback(async (provider: "kakao" | "apple", next: string) => {
    if (Date.now() - loginStartedAt.current < LOGIN_TAP_GUARD_MS) return;
    loginStartedAt.current = Date.now();
    const turn = ++loginTurn.current;
    try {
      const payload =
        provider === "kakao"
          ? { provider: "kakao" as const, ...(await kakaoNativeLogin()) }
          : { provider: "apple" as const, ...(await appleNativeLogin()) };
      // 그사이 새 시도가 시작됐다 — 이 결과는 버린다(서버엔 아직 안 갔다. 서버 로그인까지 간 뒤엔 끝까지 적용한다 — 토큰은 이미 저장됐다)
      if (turn !== loginTurn.current) return;
      const r = await auth.login(payload);
      setSource(handoff(r.handoffCode, next, "login"));
    } catch (e) {
      if (turn === loginTurn.current && !(e instanceof LoginCancelled)) Alert.alert("로그인이 안 됐어", "잠시 후 다시 시도해줘");
    }
  }, []);

  /** 이동 규칙 결정을 실행한다. 웹뷰가 그대로 열어도 되면 true */
  const act = useCallback(
    (d: NavDecision, url: string): boolean => {
      switch (d.kind) {
        case "allow":
          return true;
        case "login":
          // 안드로이드엔 애플 버튼이 없다(웹이 숨긴다) — 혹시 와도 막기만 한다
          if (d.provider === "kakao" || Platform.OS === "ios") void startNativeLogin(d.provider, d.next);
          return false;
        case "browser":
          void WebBrowser.openBrowserAsync(url).catch(() => {});
          return false;
        case "os":
          void openExternal(url);
          return false;
        case "block":
          return false;
      }
    },
    [startNativeLogin],
  );

  const onShouldStart = useCallback(
    (req: ShouldStartRequest) => act(decideNavigation(req.url, config.baseUrl, { isTopFrame: req.isTopFrame }), req.url),
    [act],
  );

  // target=_blank·window.open — 우리 페이지면 이 웹뷰에서, 나머지는 같은 규칙으로
  const onOpenWindow = useCallback(
    (e: OpenWindowEvent) => {
      const url = e.nativeEvent.targetUrl;
      if (act(decideNavigation(url, config.baseUrl), url) && isOurUrl(url, config.baseUrl)) setSource(plain(url));
    },
    [act],
  );

  const onMessage = useCallback((e: MessageEvent) => {
    if (!isOurUrl(e.nativeEvent.url, config.baseUrl)) return; // 우리 페이지가 보낸 메시지만
    const msg = parseWebToApp(e.nativeEvent.data);
    if (msg?.type === "auth.loggedOut") void auth.logout();
  }, []);

  const onError = useCallback((e: ErrorEvent) => {
    const { code } = e.nativeEvent;
    // iOS -999(이동 취소)·102(정책상 중단 — 가로챈 이동)는 실패가 아니다
    if (Platform.OS === "ios" && (code === -999 || code === 102)) return;
    setOffline(true);
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const retry = useCallback(() => {
    setOffline(false);
    if (loadedOnce.current) {
      webRef.current?.reload();
    } else {
      // 첫 화면이 한 번도 안 떴으면 교환 코드부터 다시(60초면 만료) — 웹뷰를 새로 연다
      setSource(null);
      void boot();
    }
  }, [boot]);

  if (!source) return <View style={styles.fill} />;

  return (
    <View style={styles.fill}>
      <WebView<object>
        ref={webRef}
        source={source}
        style={styles.fill}
        applicationNameForUserAgent={UA_SUFFIX}
        injectedJavaScriptBeforeContentLoaded={INJECT_APP_INFO}
        // 🔴 모든 주소를 이동 규칙(decideNavigation)이 정하게 연다. 기본값(http·https)이면 그 밖의 주소(intent:·kakaolink:·tel:·data:·blob: …)는
        //    라이브러리가 onShouldStartLoadWithRequest 를 건너뛰고 Linking.canOpenURL → openURL 로 직접 연다(iframe 이 보낸 것도 —
        //    react-native-webview WebViewShared.tsx createOnShouldStartLoadWithRequest). 안드로이드 intent:(카카오톡 공유)는 canOpenURL 이
        //    false 라 오류 하나 없이 아무 일도 안 일어난다
        originWhitelist={["*"]}
        onShouldStartLoadWithRequest={onShouldStart}
        onOpenWindow={onOpenWindow}
        onMessage={onMessage}
        onNavigationStateChange={(s) => {
          canGoBack.current = s.canGoBack;
        }}
        onLoad={() => {
          loadedOnce.current = true;
        }}
        onLoadEnd={() => {
          SplashScreen.hideAsync().catch(() => {});
        }}
        onError={onError}
        domStorageEnabled
        allowsBackForwardNavigationGestures
        webviewDebuggingEnabled={config.variant === "development"}
      />
      {offline && <OfflineView onRetry={retry} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#FAF6F0" },
});
