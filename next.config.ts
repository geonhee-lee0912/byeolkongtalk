import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 앱 화면 전환(React <ViewTransition>, components/layout/AppShell.tsx). 웹(브라우저)은 app/globals.css 가 애니메이션을 전부 끈다 — 스펙 2026-11-07-앱-화면 §6
  experimental: { viewTransition: true },
};

export default nextConfig;
