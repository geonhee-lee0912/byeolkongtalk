// 앱 모드 표시 — 루트 레이아웃 <body> 첫 자식 인라인 스크립트. 첫 화면이 그려지기 전에 <html data-app data-platform> 을 붙인다.
// 웹·앱이 다른 부분은 둘 다 그려 두고 CSS(web-only/app-only, app/globals.css)로 하나를 숨긴다 — 서버가 앱 여부를 몰라도 깜빡임이 없다.
// 판정 규칙은 lib/app-context.ts getAppInfo 와 같다: 1차 = 앱이 문서 시작 전에 넣는 window.__BYEOLKONG_APP__, 2차 = UA 꼬리.
// 안드로이드는 문서 시작 전 주입이 이 스크립트보다 늦을 수 있어 UA 를 함께 본다(스펙 2026-11-07-앱-화면 §3).
import { APP_UA_RE_SOURCE } from "../app-bridge/protocol.ts";

export function appModeScript(): string {
  return `(function(){try{var a=window.__BYEOLKONG_APP__,p=null;if(a&&typeof a==="object"&&typeof a.version==="string"&&(a.platform==="ios"||a.platform==="android"))p=a.platform;if(!p){var m=new RegExp(${JSON.stringify(APP_UA_RE_SOURCE)}).exec(navigator.userAgent||"");p=m?m[2]:null}if(p){var d=document.documentElement;d.setAttribute("data-app","");d.setAttribute("data-platform",p)}}catch(e){}})();`;
}
