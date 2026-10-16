// 카카오톡 앱 로그인에서 돌아오는 주소를 카카오 SDK 에 넘긴다(iOS). 스펙 2026-10-12-앱-1 §7-3.
// @react-native-seoul/kakao-login 6.0.4 의 플러그인은 AppDelegate 의 application(_:open:options:) "안에" 코드를 넣는데,
// Expo SDK 58 템플릿(장면 기반 생명주기)엔 그 함수가 없어 아무것도 넣지 않고 조용히 넘어간다(prebuild 는 성공한다) →
// 카카오톡에서 돌아와도 login() 이 끝나지 않는다. ExpoAppSceneDelegate 는 장면이 받은 주소(실행 중·콜드 스타트 둘 다)를
// AppDelegate 의 이 함수로 넘기므로, 함수를 만들어 거기서 처리한다.
// 🔴 app.config.ts plugins 에서 "@react-native-seoul/kakao-login" 보다 앞에 둔다 — 파일 mod 는 나중에 등록된 플러그인 것부터 돈다.
//    앞에 두면 카카오 플러그인 mod 가 먼저 돌아(함수가 없어 import 만 넣는다) 이 mod 가 마지막에 함수를 만든다.
//    뒤에 두면 카카오 플러그인이 이 함수 머리에 자기 줄(Swift 이름을 추측한 줄)을 또 넣는다 — 그래서 순서가 틀리면 멈춘다.
const { withAppDelegate } = require("expo/config-plugins");

const TAG = "byeolkong-kakao-open-url";
const METHOD = `
  // @generated ${TAG} — 카카오톡 로그인에서 돌아온 주소만 카카오 SDK 로. SDK 가 앱 키로 초기화됐을 때만(키가 비면 isKakaoTalkLoginUrl 이 멈춘다)
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    if (try? KakaoSDK.shared.appKey()) != nil, AuthApi.isKakaoTalkLoginUrl(url) {
      return AuthController.handleOpenUrl(url: url)
    }
    return super.application(app, open: url, options: options)
  }
`;

function addKakaoOpenUrl(src) {
  if (src.includes(TAG)) return src;
  if (!/^import kakao_login$/m.test(src)) {
    throw new Error(`[${TAG}] 카카오 플러그인 mod 가 먼저 돌지 않았다 — app.config.ts plugins 에서 이 플러그인을 "@react-native-seoul/kakao-login" 보다 앞에 둔다`);
  }
  if (/func\s+application\(\s*_\s+\w+\s*:\s*UIApplication\s*,\s*open\s+url\s*:/.test(src)) {
    throw new Error(`[${TAG}] AppDelegate 에 application(_:open:options:) 가 이미 있다 — Expo 템플릿이나 카카오 플러그인이 바뀌었다. 이 플러그인을 다시 본다`);
  }
  const cls = /\bclass AppDelegate\b[^{]*\{/.exec(src);
  if (!cls) throw new Error(`[${TAG}] AppDelegate 클래스를 못 찾았다`);
  // 클래스 끝 괄호 — 템플릿의 이 클래스엔 문자열·주석 속 중괄호가 없다
  let depth = 0;
  let end = -1;
  for (let i = cls.index + cls[0].length - 1; i < src.length && end < 0; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) end = i;
  }
  if (end < 0) throw new Error(`[${TAG}] AppDelegate 클래스 끝을 못 찾았다`);
  const withMethod = src.slice(0, end) + METHOD + src.slice(end);
  // import 는 첫 import 줄 앞에(템플릿 첫 줄은 "internal import Expo")
  const firstImport = withMethod.search(/^(?:(?:internal|public|package|fileprivate|private)\s+)?import\s/m);
  if (firstImport < 0) throw new Error(`[${TAG}] import 줄을 못 찾았다`);
  return withMethod.slice(0, firstImport) + "import KakaoSDKAuth\nimport KakaoSDKCommon\n" + withMethod.slice(firstImport);
}

module.exports = (config) =>
  withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== "swift") throw new Error(`[${TAG}] Swift AppDelegate 만 다룬다(Expo SDK 58 템플릿)`);
    cfg.modResults.contents = addKakaoOpenUrl(cfg.modResults.contents);
    return cfg;
  });
