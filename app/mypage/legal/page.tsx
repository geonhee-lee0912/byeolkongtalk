import type { Metadata } from "next";
import Link from "next/link";
import BusinessInfo from "@/components/layout/BusinessInfo";

// 약관·사업자 정보 — 앱에서 푸터를 숨긴 대신 마이 맨 아래 한 줄로 여는 화면. 로그인 없이 열린다. 스펙 2026-11-07-앱-화면 §9, 시안 ④
export const metadata: Metadata = {
  title: "약관·사업자 정보",
  robots: { index: false },
};

const LINKS = [
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/refund", label: "환불정책" },
];

export default function LegalPage() {
  return (
    <main className="flex flex-1 flex-col w-full py-6 animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5">
        <div className="bg-white rounded-2xl border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.07)] overflow-hidden divide-y divide-lilac-mid/15">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="flex items-center gap-3 p-3.5">
              <span className="flex-1 text-14 text-eye-purple font-medium">{l.label}</span>
              <span className="text-text-light/40">›</span>
            </Link>
          ))}
        </div>
        <div className="mt-6 px-1">
          <BusinessInfo />
        </div>
      </div>
    </main>
  );
}
