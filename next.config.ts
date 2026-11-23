import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 앱 화면 전환(React <ViewTransition>, components/layout/AppShell.tsx). 웹(브라우저)은 app/globals.css 가 애니메이션을 전부 끈다 — 스펙 2026-11-07-앱-화면 §6
  experimental: { viewTransition: true },
  // 애플 루트 인증서 — lib/payment/iap/apple.ts 가 실행 중에 파일로 읽는다(process.cwd() 기준). 추적기가 못 보니 앱 결제 라우트 묶음(환불 알림 포함)에 직접 넣는다.
  // 빠지면 로컬·테스트는 돌고 Vercel 에서만 애플 확인이 ENOENT 로 죽는다
  outputFileTracingIncludes: { "/api/payment/iap/**": ["./lib/payment/iap/apple-root-ca-g3.cer"] },
};

export default nextConfig;
