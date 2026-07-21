"use client";

// 어드민 접이식 그룹 nav — 홈(대시보드) 단독 + 접이식 그룹 4개.
// 뱃지 데이터는 서버(layout)에서 조회해 props 로 받음. 펼침 상태만 client.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { href: string; label: string; emoji: string };
type Group = { key: string; label: string; emoji: string; items: Item[] };

const HOME: Item = { href: "/admin", label: "대시보드", emoji: "🏠" };
const GROUPS: Group[] = [
  { key: "analytics", label: "분석·성과", emoji: "📈", items: [
    { href: "/admin/analytics", label: "애널리틱스", emoji: "📊" },
    { href: "/admin/relationship", label: "연애 상담", emoji: "💞" },
    { href: "/admin/paywall", label: "페이월", emoji: "🔒" },
    { href: "/admin/ads", label: "광고 지출", emoji: "📣" },
  ] },
  { key: "ops", label: "운영·고객", emoji: "👥", items: [
    { href: "/admin/users", label: "사용자", emoji: "👤" },
    { href: "/admin/readings", label: "리딩/상담", emoji: "🔮" },
    { href: "/admin/relationship-readings", label: "연애 상담 리딩", emoji: "💌" },
    { href: "/admin/payments", label: "결제/정산", emoji: "💳" },
    { href: "/admin/inquiries", label: "문의/고객센터", emoji: "💬" },
    { href: "/admin/fortune-refunds", label: "운세 환불", emoji: "🎁" },
  ] },
  { key: "monitor", label: "모니터링", emoji: "🚨", items: [
    { href: "/admin/sensitive", label: "민감 알림", emoji: "🚑" },
    { href: "/admin/errors", label: "에러 로그", emoji: "🚨" },
  ] },
  { key: "content", label: "콘텐츠", emoji: "📢", items: [
    { href: "/admin/popups", label: "공지 팝업", emoji: "📢" },
  ] },
];

export function AdminNav({ badges, errBadge }: { badges: Record<string, number>; errBadge: { err: number; warn: number } }) {
  const pathname = usePathname();
  // 경로 프리픽스 충돌 방지 (예: /admin/relationship-readings 가 /admin/relationship 에 매칭되지 않게)
  const matches = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const activeGroup = GROUPS.find((g) => g.items.some((it) => matches(it.href)))?.key;
  const [open, setOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(GROUPS.map((g) => [g.key, g.key === activeGroup]))
  );
  const fmt = (n: number) => (n > 99 ? "99+" : String(n));
  const groupBadge = (g: Group) => g.items.reduce((s, it) => s + (badges[it.href] ?? 0), 0) + (g.key === "monitor" ? errBadge.err + errBadge.warn : 0);
  const linkCls = "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] text-white/80 hover:bg-white/5 hover:text-white transition-colors";

  const Badge = ({ href }: { href: string }) => {
    if (href === "/admin/errors") {
      return (errBadge.err > 0 || errBadge.warn > 0) ? (
        <span className="ml-auto flex items-center gap-1">
          {errBadge.err > 0 && <span className="bg-rose-500 text-white text-[11px] font-bold rounded-full px-1.5 min-w-[18px] text-center">{fmt(errBadge.err)}</span>}
          {errBadge.warn > 0 && <span className="bg-yellow-400 text-night text-[11px] font-bold rounded-full px-1.5 min-w-[18px] text-center">{fmt(errBadge.warn)}</span>}
        </span>
      ) : null;
    }
    return (badges[href] ?? 0) > 0 ? (
      <span className="ml-auto bg-rose-500 text-white text-[11px] font-bold rounded-full px-1.5 min-w-[18px] text-center">{fmt(badges[href])}</span>
    ) : null;
  };

  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      <Link href={HOME.href} className={linkCls}>
        <span>{HOME.emoji}</span>
        <span className="flex-1">{HOME.label}</span>
      </Link>
      {GROUPS.map((g) => {
        const gb = groupBadge(g);
        const isOpen = open[g.key];
        return (
          <div key={g.key}>
            <button
              onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] uppercase tracking-wide text-white/45 hover:text-white/70"
            >
              <span>{g.emoji}</span>
              <span className="flex-1 text-left">{g.label}</span>
              {!isOpen && gb > 0 && <span className="bg-rose-500 text-white text-[10px] font-bold rounded-full px-1.5">{fmt(gb)}</span>}
              <span className="text-white/30">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="space-y-1 pl-2">
                {g.items.map((it) => (
                  <Link key={it.href} href={it.href} className={linkCls}>
                    <span>{it.emoji}</span>
                    <span className="flex-1">{it.label}</span>
                    <Badge href={it.href} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
