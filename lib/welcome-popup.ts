// 웰컴 별 팝업을 띄울지 — 가입 직후 1회, /start 밖(앱·웹 어느 화면이든). 계약은 welcome-popup.test.ts.
// welcome=1 은 "새 회원"일 뿐이라(재가입은 웰컴 별이 막힌다) 실제 잔액이 웰컴 별만큼 있을 때만 "도착"이라 말한다.
import { WELCOME_BONUS_STARS } from "./constants";

export function shouldShowWelcomePopup(p: {
  login: string | null;
  welcome: string | null;
  pathname: string;
  balance: number | null;
}): boolean {
  if (p.login !== "success" || p.welcome !== "1") return false;
  if (p.pathname === "/start") return false; // /start 는 자기 팝업(app/start/page.tsx)
  return typeof p.balance === "number" && p.balance >= WELCOME_BONUS_STARS;
}
