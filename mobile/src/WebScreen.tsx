// 웹뷰 화면 — 링크 규칙·네이티브 로그인·웹 메시지·뒤로 가기·오프라인·딥링크·알림 누름. 스펙 2026-10-12-앱-1 §4·§5·§7 · 2026-11-06-앱-알림.
// 앱 토큰·푸시 토큰은 웹에 절대 넘기지 않는다 — 웹뷰는 교환 코드로 받은 쿠키만 쓰고, 알림은 권한 상태만 알린다.
// 교환 코드는 주소가 아니라 source.headers 로 싣는다(handoffSource — 서버는 주소의 code 를 보지 않는다). 헤더는 앱이 연 그 첫 요청에만
// 실리고 웹뷰 안 이동엔 안 실린다 — 그래서 딥링크·일반 이동은 헤더 없이(plain) 열어도 남의 코드를 먹일 수 없다.
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewProps } from "react-native-webview";
import * as WebBrowser from "expo-web-browser";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";
import { APP_EVENT, appUserAgentSuffix, encodeAppToWeb, encodeAppToWebBack, parseWebToApp, type PushState } from "../../lib/app-bridge/protocol.ts";
import { decideAndroidBack, iosPullEnabled, overlayAfterLoadStart } from "./ui.ts";
import { appInfo, config } from "./config";
import { decideNavigation, parseIntentUrl, type NavDecision } from "./linkRules.ts";
import { pathFromDeepLink } from "./deeplink.ts";
import { handoffSource, isOurUrl, pathOf, resetUrl, splitUrl, withVercelBypass, type HandoffMode, type WebSource } from "./urls.ts";
import { createAuthSession } from "./auth/session.ts";
import { secureTokenStore } from "./auth/tokenStore";
import { authApi, isAuthError, reportLoginFailure } from "./auth/api";
import { appleNativeLogin, kakaoNativeLogin, LoginCancelled } from "./auth/nativeLogin";
import OfflineView from "./OfflineView";
import { pathFromNotificationResponse, UNSUBSCRIBE_ACTION } from "./push/state.ts";
import {
  ensureAndroidChannel,
  ensureNotificationCategories,
  getPushState,
  requestPush,
  showNotificationsInForeground,
  syncPushToken,
  unregisterPush,
} from "./push/register";

// 🔴 react-native-webview 14.0.1 의 타입 선언은 class WebView<P = undefined> extends Component<WebViewProps & P> 라 P 를 안 주면 props 가 never 가 된다
//    (ComponentProps<typeof WebView> 도 never) — 이벤트 타입은 패키지의 WebViewProps 에서 꺼내고, ref·JSX 에는 타입 인자 object 를 준다(WebView<object>)
type ShouldStartRequest = Parameters<NonNullable<WebViewProps["onShouldStartLoadWithRequest"]>>[0];
type MessageEvent = Parameters<NonNullable<WebViewProps["onMessage"]>>[0];
type OpenWindowEvent = Parameters<NonNullable<WebViewProps["onOpenWindow"]>>[0];
type ErrorEvent = Parameters<NonNullable<WebViewProps["onError"]>>[0];

SplashScreen.preventAutoHideAsync().catch(() => {});
showNotificationsInForeground();

const auth = createAuthSession({ store: secureTokenStore, api: authApi, isAuthError });
const UA_SUFFIX = appUserAgentSuffix(appInfo);
/** 로그인 연타 막기 — 이 시간 안에 다시 온 로그인 시작은 버린다(같은 로그인 화면이 두 번 뜨지 않게) */
const LOGIN_TAP_GUARD_MS = 1_000;
/** 로그인 마무리 덮개의 화면 단계 최대 시간 — 교환 코드 이동을 건 뒤부터 잰다. 보통은 로그인된 첫 화면이 뜨면(수 초) 걷힌다.
 *  끝내 안 뜨면 이 시간 뒤에 걷어 다시 시도할 수 있게 한다 */
const LOGIN_COVER_MAX_MS = 30_000;
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

/** 딥링크 → 웹뷰가 그대로 열 경로. 이동 규칙이 가로채는 경로(로그인 시작 주소)는 버린다 — 바깥 링크 하나로 네이티브 로그인이 뜨고,
 *  콜드 스타트면 첫 이동이 가로채여 화면이 하나도 안 떠 스플래시가 닫히지 않는다(로그인을 취소하면 그대로 멈춘다).
 *  iOS 는 source 이동도 이동 규칙에 묻고 안드로이드는 묻지 않아 플랫폼마다 달랐다 — 여기서 같은 규칙으로 거른다 */
function openablePath(url: string | null | undefined): string | null {
  return allowedPath(pathFromDeepLink(url, config.scheme));
}

function allowedPath(path: string | null): string | null {
  return path && decideNavigation(config.baseUrl + path, config.baseUrl).kind === "allow" ? path : null;
}

/** 알림 누름 → 웹뷰가 열 경로. 딥링크와 같은 규칙으로 거른다. 본문 누름은 그 화면, 광고의 [수신거부] 버튼은 수신거부 화면 */
function notificationPath(r: Notifications.NotificationResponse | null): string | null {
  if (!r) return null;
  return allowedPath(
    pathFromNotificationResponse(r.actionIdentifier, Notifications.DEFAULT_ACTION_IDENTIFIER, r.notification.request.content.data),
  );
}

/** [수신거부] 버튼을 눌렀으면 그 알림을 알림창에서 걷는다(안드로이드는 버튼을 눌러도 알림이 남는다). 실패해도 무시 */
function dismissIfUnsubscribed(r: Notifications.NotificationResponse | null): void {
  if (r?.actionIdentifier !== UNSUBSCRIBE_ACTION) return;
  void Notifications.dismissNotificationAsync(r.notification.request.identifier).catch(() => {});
}

/** 앱을 띄운 알림 누름 — 읽고 지운다(지우지 않으면 앱 화면이 다시 만들어질 때 옛 알림의 화면이 또 열린다). 실패해도 부팅은 간다 */
function takeLaunchNotification(): Notifications.NotificationResponse | null {
  try {
    const r = Notifications.getLastNotificationResponse();
    if (r) Notifications.clearLastNotificationResponse();
    return r;
  } catch (e) {
    console.warn("[push] 앱을 띄운 알림을 못 읽었다", e);
    return null;
  }
}

export default function WebScreen() {
  const webRef = useRef<WebView<object>>(null);
  const [source, setSource] = useState<WebSource | null>(null);
  const [offline, setOffline] = useState(false);
  const canGoBack = useRef(false);
  // 웹이 미리 알린 겹창(시트·확인창) 열림 상태(ui.overlay) — 안드로이드 뒤로 버튼이 이걸 보고 정한다. 새 문서를 읽기 시작하면 닫힘
  const overlayOpen = useRef(false);
  // 아이폰 당겨서 새로고침 — 탭 첫 화면에서만 켠다(지금 주소 기준)
  const [pullOn, setPullOn] = useState(false);
  const loadedOnce = useRef(false);
  // 네이티브 로그인 번호표 — 새 시도가 앞 시도를 대신한다. 끝나지 않은 앞 시도를 기다리는 잠금은 두지 않는다:
  // iOS 카카오톡에서 복귀 주소 없이 돌아오면('◀ 별콩톡'·앱 전환) kakaoNativeLogin 이 영영 끝나지 않아(auth/nativeLogin.ts) 잠금이면
  // 앱을 껐다 켤 때까지 로그인 버튼이 죽는다
  const loginTurn = useRef(0);
  const loginStartedAt = useRef(0);
  // 로그인 마무리 덮개 — 카카오톡·애플 확인이 끝난 뒤 로그인된 첫 화면이 뜰 때까지(서버 로그인 + 쿠키 맞추기 + 페이지 로드) 화면을 덮는다.
  // 그동안 옛 로그인 화면이 그대로 보여 다시 누르게 되는데, 누를 때마다 로그인이 또 시작되고 진행 중이던 화면 전환이 끊겨
  // 쿠키가 안 들어가거나 웹의 로그인 표시가 안 맞았다(2026-10-17 실기기 — 7번 탭에 서버 로그인 5번, 앱을 다시 켜야 로그인돼 보임).
  // 덮개가 떠 있는 동안 새 로그인 시작·뒤로 가기는 무시한다. 카카오톡 화면이 떠 있는 단계엔 덮지 않는다 — 위 번호표 주석의 iOS 경우
  const [covering, setCovering] = useState(false);
  const coveringRef = useRef(false);
  const coverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 교환 코드 이동을 걸어 둔 뒤 그 첫 화면이 아직 안 끝났다 — 끝나면(onLoadEnd) 덮개를 걷는다
  const handoffLoading = useRef(false);
  // 웹뷰를 새로 만들 때(reopen) 바꾸는 key · 그때 열 마지막 화면(우리 페이지만, /api/ 주소 빼고)
  const [webKey, setWebKey] = useState(0);
  const lastPage = useRef<string | null>(null);
  // 마지막으로 처리한 알림 누름 — 앱을 띄운 알림이 누름 수신(listener)으로도 한 번 더 올 수 있어 같은 알림은 한 번만 연다
  const handledNotification = useRef<string | null>(null);

  // 앱 실행 — 토큰 갱신 + 교환 코드로 웹뷰 쿠키를 맞춘다(스펙 §7-4). 알림을 눌러 열렸으면 그 경로로, 딥링크로 열렸으면 그 경로로
  const boot = useCallback(async () => {
    // 알림 누름은 await 앞에서 읽는다 — 아래 누름 수신 effect 가 붙기 전에 '처리함'으로 적어 둬야 같은 누름을 두 번 열지 않는다
    const launch = takeLaunchNotification();
    if (launch) handledNotification.current = launch.notification.request.identifier;
    dismissIfUnsubscribed(launch);
    const fromNotification = notificationPath(launch);
    // 실행 주소를 못 읽어도 부팅은 끝까지 간다 — 여기서 멈추면 source 가 안 생겨 스플래시가 닫히지 않는다
    const next = fromNotification ?? openablePath(await Linking.getInitialURL().catch(() => null)) ?? "/";
    const target = await auth.startTarget();
    // reset = 이 기기 로그인이 끝났다(웹 로그아웃 없이 갱신 401·재사용·만료로 끝난 것 포함) — 이 기기 알림 묶음도 푼다.
    // 앞서 로그아웃 때 해제가 실패했어도 여기서 다시 한다. 기억한 토큰이 없으면 아무것도 안 하고 던지지 않는다. 기다리지 않는다
    if (target.kind === "reset") void unregisterPush();
    setSource(
      target.kind === "handoff"
        ? handoff(target.code, next, "launch")
        : plain(target.kind === "reset" ? resetUrl(config.baseUrl, next) : config.baseUrl + next),
    );
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  // 알림 — 안드로이드 채널을 만들고, 이미 허락·로그인돼 있으면 토큰을 다시 등록한다(토큰 회전 대비). 실패는 register.ts 가 삼킨다
  useEffect(() => {
    void ensureAndroidChannel();
    void ensureNotificationCategories();
    void syncPushToken(auth.ensureAccessToken);
  }, []);

  // 앱이 떠 있을 때(뒤에 있다 돌아온 것 포함) 누른 알림 — 딥링크와 같은 방식으로 연다
  useEffect(() => {
    let sub: { remove(): void } | null = null;
    try {
      sub = Notifications.addNotificationResponseReceivedListener((r) => {
        const id = r.notification.request.identifier;
        if (id === handledNotification.current) return;
        handledNotification.current = id;
        try {
          Notifications.clearLastNotificationResponse();
        } catch {
          // 지우기 실패 — 앱 화면이 다시 만들어질 때 이 알림 화면이 한 번 더 열릴 뿐이다
        }
        dismissIfUnsubscribed(r);
        const path = notificationPath(r);
        if (path) setSource(plain(config.baseUrl + path));
      });
    } catch (e) {
      console.warn("[push] 알림 누름 수신을 못 붙였다", e);
    }
    return () => sub?.remove();
  }, []);

  // 앱이 떠 있을 때 들어온 딥링크
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      const path = openablePath(url);
      if (path) setSource(plain(config.baseUrl + path)); // 헤더 없이 — 경로에 code 를 넣어 와도 서버가 보지 않는다
    });
    return () => sub.remove();
  }, []);

  // 안드로이드 뒤로 가기 — 로그인 마무리 덮개 중엔 무시(쿠키 맞추기 이동이 끊긴다), 겹창이 열려 있으면 웹이 맨 위를 닫게(ui.back),
  // 아니면 웹뷰 기록이 있으면 뒤로, 없으면 OS 기본(앱 닫기). 판단은 ui.ts(테스트)
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      switch (decideAndroidBack({ covering: coveringRef.current, overlayOpen: overlayOpen.current, canGoBack: canGoBack.current })) {
        case "consume":
          return true;
        case "sendBack":
          webRef.current?.injectJavaScript(
            `window.dispatchEvent(new CustomEvent(${JSON.stringify(APP_EVENT)},{detail:${JSON.stringify(encodeAppToWebBack())}}));true;`,
          );
          return true;
        case "goBack":
          webRef.current?.goBack();
          return true;
        case "exit":
          return false;
      }
    });
    return () => sub.remove();
  }, []);

  const endCover = useCallback(() => {
    if (coverTimer.current) clearTimeout(coverTimer.current);
    coverTimer.current = null;
    handoffLoading.current = false;
    coveringRef.current = false;
    setCovering(false);
  }, []);

  useEffect(
    () => () => {
      if (coverTimer.current) clearTimeout(coverTimer.current);
    },
    [],
  );

  const startNativeLogin = useCallback(
    async (provider: "kakao" | "apple", next: string) => {
      if (coveringRef.current) return; // 앞 로그인을 마무리하는 중 — 새 로그인을 시작하면 그 화면 전환이 끊긴다
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
        coveringRef.current = true;
        setCovering(true);
        const r = await auth.login(payload);
        // 이미 알림을 허락한 기기면 이 회원으로 다시 등록한다(로그아웃 때 서버에서 지웠다). 다음 실행까지 기다리지 않게
        void syncPushToken(auth.ensureAccessToken);
        handoffLoading.current = true;
        // 30초는 화면 단계만 잰다 — 서버 단계는 요청 시간 제한(api.ts 10초)으로 반드시 아래 catch 로 끝난다. 서버 단계부터 재면 앱이 멈췄다 돌아올 때
        // 덮개가 먼저 걷혀 새 로그인이 시작될 수 있고, 이 로그인은 서버 단계 뒤엔 번호표를 안 보니 교환 코드 이동이 연달아 두 번 나간다
        coverTimer.current = setTimeout(endCover, LOGIN_COVER_MAX_MS);
        setSource(handoff(r.handoffCode, next, "login"));
      } catch (e) {
        if (turn !== loginTurn.current) return;
        endCover();
        if (!(e instanceof LoginCancelled)) {
          reportLoginFailure(provider, e);
          Alert.alert("로그인이 안 됐어", "잠시 후 다시 시도해줘");
        }
      }
    },
    [endCover],
  );

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

  /** 웹에 알림 권한 상태를 알린다 — window 의 CustomEvent(APP_EVENT). 웹은 요청마다 답 하나를 기다리니 요청마다 꼭 한 번 부른다.
   *  🔴 상태만 싣는다 — 푸시 토큰·앱 토큰은 넘기지 않는다 */
  const replyPushState = useCallback((state: PushState) => {
    webRef.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent(${JSON.stringify(APP_EVENT)},{detail:${JSON.stringify(encodeAppToWeb(state))}}));true;`,
    );
  }, []);

  const onMessage = useCallback(
    (e: MessageEvent) => {
      if (!isOurUrl(e.nativeEvent.url, config.baseUrl)) return; // 우리 페이지가 보낸 메시지만
      const msg = parseWebToApp(e.nativeEvent.data);
      switch (msg?.type) {
        case "auth.loggedOut":
          // 둘을 따로 바로 시작한다 — 로그아웃은 알림 해제(최대 10초)를 기다리지 않는다. 기다리는 동안 앱이 꺼지면 앱 토큰이 남아
          // 다음 실행 때 조용히 다시 로그인된다. 알림 해제는 앱 토큰을 쓰지 않고(로그인 없이 받는 라우트) 그 실패는 로그아웃과 무관하다.
          // auth.logout 은 리프레시 토큰 키만 지운다(auth/tokenStore.ts) — push_token 은 그대로라 순서가 필요 없다
          void unregisterPush();
          void auth.logout();
          break;
        case "push.status":
          void getPushState().then(replyPushState);
          break;
        case "push.request":
          void requestPush(auth.ensureAccessToken).then(replyPushState);
          break;
        case "push.openSettings":
          void Linking.openSettings().catch(() => {});
          break;
        case "ui.overlay":
          overlayOpen.current = msg.payload.open;
          break;
        case "ui.refresh":
          webRef.current?.reload();
          break;
        case "ui.haptic":
          // 탭 전환·카드 놓기 = 가벼운 톡, 결제 완료 = 완료 진동. 진동이 안 되는 기기·설정이면 조용히 넘어간다. 스펙 §5 ⑥
          void (msg.payload.kind === "success"
            ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
            : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          ).catch(() => {});
          break;
      }
    },
    [replyPushState],
  );

  const onError = useCallback((e: ErrorEvent) => {
    const { code } = e.nativeEvent;
    // iOS -999(이동 취소)·102(정책상 중단 — 가로챈 이동)는 실패가 아니다
    if (Platform.OS === "ios" && (code === -999 || code === 102)) return;
    endCover(); // 덮개가 '다시 시도' 화면을 가리지 않게
    setOffline(true);
    SplashScreen.hideAsync().catch(() => {});
  }, [endCover]);

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

  // 안드로이드 — 웹뷰 렌더 프로세스가 죽으면(백그라운드 메모리 회수·충돌) 그 웹뷰는 다시 못 쓴다(WebViewClient.onRenderProcessGone 문서).
  // 라이브러리는 앱이 꺼지지 않게만 막고 죽은 웹뷰를 그대로 둬 화면이 빈다 — 새 웹뷰(key)로 마지막 화면을 연다.
  // source 를 그대로 다시 열면 교환 코드 주소(이미 쓴 코드)라 로그인 실패로 간다 — 헤더 없는 마지막 화면 주소로
  const reopen = useCallback(() => {
    canGoBack.current = false;
    setOffline(false);
    setSource(plain(lastPage.current ?? config.baseUrl + "/"));
    setWebKey((k) => k + 1);
  }, []);

  if (!source) return <View style={styles.fill} />;

  return (
    <View style={styles.fill}>
      <WebView<object>
        key={webKey}
        ref={webRef}
        source={source}
        style={styles.fill}
        applicationNameForUserAgent={UA_SUFFIX}
        // 글자 고정(스펙 2026-11-09 §2.2) — 안드로이드 웹뷰는 기본으로 기기 글자 배율을 따라가 칸이 깨진다. 켤 땐 웹 html 루트와 같이
        textZoom={100}
        injectedJavaScriptBeforeContentLoaded={INJECT_APP_INFO}
        // 🔴 모든 주소를 이동 규칙(decideNavigation)이 정하게 연다. 기본값(http·https)이면 그 밖의 주소(intent:·kakaolink:·tel:·data:·blob: …)는
        //    라이브러리가 onShouldStartLoadWithRequest 를 건너뛰고 Linking.canOpenURL → openURL 로 직접 연다(iframe 이 보낸 것도 —
        //    react-native-webview WebViewShared.tsx createOnShouldStartLoadWithRequest). 안드로이드 intent:(카카오톡 공유)는 canOpenURL 이
        //    false 라 오류 하나 없이 아무 일도 안 일어난다
        originWhitelist={["*"]}
        onShouldStartLoadWithRequest={onShouldStart}
        onOpenWindow={onOpenWindow}
        onMessage={onMessage}
        onLoadStart={(e) => {
          // 새 문서를 읽기 시작할 때만 닫힘으로(웹이 closed 를 못 보내고 떠난 경우에도 뒤로 버튼이 먹게).
          // 안드로이드는 페이지 안 기록 변경(시트의 pushState)에도 이 이벤트를 보낸다 — 그땐 그대로 둔다(ui.ts)
          overlayOpen.current = overlayAfterLoadStart(overlayOpen.current, e.nativeEvent);
        }}
        onNavigationStateChange={(s) => {
          canGoBack.current = s.canGoBack;
          setPullOn(iosPullEnabled(s.url, config.baseUrl));
          if (isOurUrl(s.url, config.baseUrl) && !pathOf(splitUrl(s.url)?.rest ?? "").startsWith("/api/")) lastPage.current = s.url;
        }}
        onLoad={() => {
          loadedOnce.current = true;
        }}
        onLoadEnd={() => {
          SplashScreen.hideAsync().catch(() => {});
          // 교환 코드 이동(리다이렉트를 거친 첫 화면)이 끝났다 — 로그인 덮개를 걷는다. iOS 는 라이브러리가 history 변경(pushState·replaceState)에도
          // 이 이벤트를 보내 옛 화면이 history 를 건드리면 일찍 걷힌다 — 로그인 시작 화면은 덮개 동안 건드리지 않는다(/login 은 안 쓰고,
          // /start·/tarot/draw 의 replaceState 는 로그인 복귀 뒤·사용자 동작 때만 — 2026-10-17 확인)
          if (handoffLoading.current) endCover();
        }}
        onError={onError}
        // iOS — 웹 콘텐츠 프로세스가 죽으면(백그라운드 메모리 회수 등) 화면이 빈 채로 남는다: 라이브러리가 종료 알림 함수를 갖고 있어
        // WebKit 이 '앱이 처리했다'고 보고 스스로 다시 읽지 않는다 — 앱이 다시 읽는다(기록·주소 그대로)
        onContentProcessDidTerminate={() => webRef.current?.reload()}
        onRenderProcessGone={reopen}
        domStorageEnabled
        allowsBackForwardNavigationGestures
        // 아이폰: 탭 첫 화면에서만 당겨서 새로고침(안드로이드는 웹이 그린다 — 이 속성은 iOS 전용) · 링크 길게 누르기 미리보기 끔. 스펙 §5 ②④
        pullToRefreshEnabled={pullOn}
        allowsLinkPreview={false}
        webviewDebuggingEnabled={config.variant === "development"}
        // 덮개가 떠 있는 동안엔 스크린리더로도 웹을 못 누르게(안드로이드) — 누르면 진행 중인 교환 코드 이동이 끊긴다. 아이폰은 덮개의 accessibilityViewIsModal
        importantForAccessibility={covering ? "no-hide-descendants" : "auto"}
      />
      {offline && <OfflineView onRetry={retry} />}
      {covering && (
        <View style={styles.cover} accessibilityViewIsModal>
          <ActivityIndicator size="large" color="#5A3E8C" />
          <Text style={styles.coverText}>로그인하는 중이야…</Text>
        </View>
      )}
    </View>
  );
}

// 색은 웹 디자인 토큰(cream·eye-purple) — OfflineView 와 같다
const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#FAF6F0" },
  cover: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(250, 246, 240, 0.94)" },
  coverText: { marginTop: 14, fontSize: 15, color: "#5A3E8C" },
});
