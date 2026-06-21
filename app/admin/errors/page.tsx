// app/admin/errors/page.tsx
import { getServiceSupabase } from "@/lib/supabase";
import Link from "next/link";

export const dynamic = "force-dynamic";

type ErrorLog = {
  id: string;
  created_at: string;
  level: string;
  source: string;
  message: string;
  stack: string | null;
  route: string | null;
  user_id: string | null;
  anonymous_id: string | null;
  user_agent: string | null;
  ip: string | null;
  fingerprint: string | null;
  context: Record<string, unknown> | null;
  resolved_at: string | null;
  resolved_by: string | null;
};

type ErrorGroup = {
  key: string;
  count: number;
  latest: ErrorLog;
  anyUnresolved: boolean;
};

export default async function AdminErrors() {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("error_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  const rows: ErrorLog[] = data ?? [];

  // JS-side grouping: key = fingerprint ?? id
  const groupMap = new Map<string, ErrorGroup>();
  for (const row of rows) {
    const key = row.fingerprint ?? row.id;
    const existing = groupMap.get(key);
    if (existing) {
      existing.count++;
      if (!row.resolved_at) existing.anyUnresolved = true;
      // latest is already the most recent (rows sorted desc)
    } else {
      groupMap.set(key, {
        key,
        count: 1,
        latest: row,
        anyUnresolved: !row.resolved_at,
      });
    }
  }

  // Sort: unresolved first, then by latest.created_at desc
  const groups = Array.from(groupMap.values()).sort((a, b) => {
    if (a.anyUnresolved !== b.anyUnresolved) return a.anyUnresolved ? -1 : 1;
    return new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime();
  });

  const LEVEL_COLOR: Record<string, string> = {
    error: "text-red-400",
    warn: "text-yellow-400",
    info: "text-blue-400",
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">에러 로그</h1>
      <table className="w-full text-sm">
        <thead className="text-white/50 text-left">
          <tr>
            <th className="py-2 pr-3">레벨</th>
            <th className="py-2 pr-3">메시지 · 라우트</th>
            <th className="py-2 pr-3 text-right">횟수</th>
            <th className="py-2 pr-3">최근시각</th>
            <th className="py-2 pr-3">상태</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr
              key={g.key}
              className={`border-t border-white/10 ${g.anyUnresolved ? "bg-red-500/10" : ""}`}
            >
              <td className="py-2 pr-3">
                <span className={`font-mono text-xs ${LEVEL_COLOR[g.latest.level] ?? "text-white/70"}`}>
                  {g.latest.level}
                </span>
              </td>
              <td className="py-2 pr-3 max-w-xs">
                <div className="truncate text-white/90">{g.latest.message}</div>
                {g.latest.route && (
                  <div className="text-white/40 text-xs truncate">{g.latest.route}</div>
                )}
              </td>
              <td className="py-2 pr-3 text-right font-mono text-white/70">{g.count}</td>
              <td className="py-2 pr-3 text-white/60 text-xs whitespace-nowrap">
                {new Date(g.latest.created_at).toLocaleString("ko-KR")}
              </td>
              <td className="py-2 pr-3">
                {g.anyUnresolved ? (
                  <span className="text-red-400 font-semibold text-xs">미해결</span>
                ) : (
                  <span className="text-white/30 text-xs">해결됨</span>
                )}
              </td>
              <td className="py-2 text-right">
                <Link
                  href={`/admin/errors/${encodeURIComponent(g.key)}`}
                  className="text-lilac-deep hover:text-lilac underline text-xs"
                >
                  상세
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
