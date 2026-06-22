// app/admin/layout.tsx — 어드민 전용 레이아웃. 화이트리스트 + HMAC 토큰 가드.
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { isAdminAuthorized } from "@/lib/admin";
import { getServiceSupabase } from "@/lib/supabase";
import { EnvBanner } from "@/components/admin/EnvBanner";

export const metadata = {
  title: "별콩 어드민",
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin", label: "대시보드", emoji: "📊" },
  { href: "/admin/users", label: "사용자", emoji: "👥" },
  { href: "/admin/readings", label: "리딩/상담", emoji: "🔮" },
  { href: "/admin/payments", label: "결제/정산", emoji: "💳" },
  { href: "/admin/inquiries", label: "문의/고객센터", emoji: "💬" },
  { href: "/admin/fortune-refunds", label: "운세 환불", emoji: "🎁" },
  { href: "/admin/sensitive", label: "민감 알림", emoji: "🚑" },
  { href: "/admin/errors", label: "에러 로그", emoji: "🚨" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await getSession();
  if (!(await isAdminAuthorized(userId))) {
    redirect("/?admin=denied");
  }

  const { count: openInquiries } = await getServiceSupabase()
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  return (
    <div className="min-h-screen bg-night text-white flex">
      <aside className="hidden md:flex md:w-56 lg:w-64 flex-col border-r border-white/10 bg-night-deep sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-white/10 flex items-center gap-2">
          <Link href="/admin" className="font-display text-[20px] tracking-wide">
            별콩 어드민
          </Link>
          <EnvBanner />
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] text-white/80 hover:bg-white/5 hover:text-white transition-colors"
            >
              <span>{item.emoji}</span>
              <span className="flex-1">{item.label}</span>
              {item.href === "/admin/inquiries" && (openInquiries ?? 0) > 0 && (
                <span className="ml-auto bg-rose-500 text-white text-[11px] font-bold rounded-full px-1.5 min-w-[18px] text-center">
                  {openInquiries}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <Link href="/" className="px-3 py-2 text-[12px] text-white/60 hover:text-white">
            ← 사용자 화면으로
          </Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-4 md:p-8">
        <div className="md:hidden mb-4 flex items-center gap-2">
          <span className="font-display text-lg">별콩 어드민</span>
          <EnvBanner />
        </div>
        {children}
      </main>
    </div>
  );
}
