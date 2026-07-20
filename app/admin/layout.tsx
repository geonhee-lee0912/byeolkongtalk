// app/admin/layout.tsx — 어드민 전용 레이아웃. 화이트리스트 + HMAC 토큰 가드.
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { isAdminAuthorized } from "@/lib/admin";
import { getServiceSupabase } from "@/lib/supabase";
import { EnvBanner } from "@/components/admin/EnvBanner";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminMobileNav } from "@/components/admin/AdminMobileNav";

export const metadata = {
  title: "별콩 어드민",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await getSession();
  if (!(await isAdminAuthorized(userId))) {
    redirect("/?admin=denied");
  }

  // 메뉴 미처리 뱃지 — 신규 발생 시 빨간 pill (처리하면 자동 소멸)
  // 에러 로그는 레벨 분리: error=빨강, warn=노랑 (info 는 대응 불필요 신호라 뱃지 제외)
  const supa = getServiceSupabase();
  const [inqRes, sensRes, errRes, warnRes] = await Promise.all([
    supa.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "open"),
    supa.from("sensitive_alerts").select("id", { count: "exact", head: true }).is("reviewed_at", null),
    supa.from("error_logs").select("id", { count: "exact", head: true }).is("resolved_at", null).eq("level", "error"),
    supa.from("error_logs").select("id", { count: "exact", head: true }).is("resolved_at", null).eq("level", "warn"),
  ]);
  const badges: Record<string, number> = {
    "/admin/inquiries": inqRes.count ?? 0,
    "/admin/sensitive": sensRes.count ?? 0,
  };
  const errCount = errRes.count ?? 0;
  const warnCount = warnRes.count ?? 0;

  return (
    <div className="min-h-screen bg-night text-white flex">
      <aside className="hidden md:flex md:w-56 lg:w-64 flex-col border-r border-white/10 bg-night-deep sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-white/10 flex items-center gap-2">
          <Link href="/admin" className="font-display text-[20px] tracking-wide">
            별콩 어드민
          </Link>
          <EnvBanner />
        </div>
        <AdminNav badges={badges} errBadge={{ err: errCount, warn: warnCount }} />
        <div className="p-3 border-t border-white/10">
          <Link href="/" className="px-3 py-2 text-[12px] text-white/60 hover:text-white">
            ← 사용자 화면으로
          </Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-4 md:p-8">
        <div className="md:hidden mb-4 flex items-center gap-2">
          <AdminMobileNav badges={badges} errBadge={{ err: errCount, warn: warnCount }} />
          <span className="font-display text-lg">별콩 어드민</span>
          <EnvBanner />
        </div>
        {children}
      </main>
    </div>
  );
}
