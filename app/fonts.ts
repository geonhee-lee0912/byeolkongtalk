import localFont from "next/font/local";

// 루트 레이아웃과 전체 오류 화면(global-error)이 같이 쓴다 — localFont 는 부를 때마다 한 벌씩 따로 실리므로 선언은 여기 하나.
export const cafe24Ssurround = localFont({
  src: "../public/fonts/Cafe24Ssurround.otf",
  variable: "--font-cafe24",
  display: "swap",
});
