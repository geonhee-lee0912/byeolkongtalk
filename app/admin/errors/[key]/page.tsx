// app/admin/errors/[key]/page.tsx
import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase";
import { CopyPromptButton } from "@/components/admin/CopyPromptButton";
import { GroupResolveButton } from "@/components/admin/GroupResolveButton";

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

export default async function AdminErrorDetail({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const decodedKey = decodeURIComponent(key);
  const supabase = getServiceSupabase();

  // Step 1: query by fingerprint
  let { data: byFingerprint } = await supabase
    .from("error_logs")
    .select("*")
    .eq("fingerprint", decodedKey)
    .order("created_at", { ascending: false });

  let rows: ErrorLog[] = byFingerprint ?? [];

  // Step 2: if no fingerprint match, try by id (UUID single row)
  if (rows.length === 0) {
    const { data: byId } = await supabase
      .from("error_logs")
      .select("*")
      .eq("id", decodedKey)
      .order("created_at", { ascending: false });
    rows = byId ?? [];
  }

  if (rows.length === 0) notFound();

  const latest = rows[0];
  const anyUnresolved = rows.some((r) => !r.resolved_at);
  const recent = rows.slice(0, 20);

  const LEVEL_COLOR: Record<string, string> = {
    error: "text-red-400",
    warn: "text-yellow-400",
    info: "text-blue-400",
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold break-all">{latest.message}</h1>
          <p className="text-white/50 text-sm mt-1">
            <span className={`font-mono mr-2 ${LEVEL_COLOR[latest.level] ?? "text-white/70"}`}>
              {latest.level}
            </span>
            <span>{latest.source}</span>
            {latest.route && <span className="ml-2 text-white/40">{latest.route}</span>}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <CopyPromptButton
            message={latest.message}
            route={latest.route}
            stack={latest.stack}
            context={latest.context}
            source={latest.source}
            level={latest.level}
          />
          {anyUnresolved && <GroupResolveButton groupKey={decodedKey} />}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="bg-white/5 rounded p-3">
          <div className="text-white/40 text-xs mb-1">발생횟수</div>
          <div className="font-bold text-lg">{rows.length}</div>
        </div>
        <div className="bg-white/5 rounded p-3">
          <div className="text-white/40 text-xs mb-1">최근 발생</div>
          <div className="text-xs">{new Date(latest.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</div>
        </div>
        <div className="bg-white/5 rounded p-3">
          <div className="text-white/40 text-xs mb-1">최초 발생</div>
          <div className="text-xs">
            {new Date(rows[rows.length - 1].created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
          </div>
        </div>
      </div>

      {/* Stack */}
      <div>
        <h2 className="text-sm font-semibold text-white/60 mb-2">스택 트레이스</h2>
        <pre className="bg-black/30 text-white/90 overflow-x-auto text-xs p-3 rounded whitespace-pre-wrap break-all">
          {latest.stack ?? "(스택 없음)"}
        </pre>
      </div>

      {/* Context */}
      <div>
        <h2 className="text-sm font-semibold text-white/60 mb-2">Context</h2>
        <pre className="bg-black/30 text-white/90 overflow-x-auto text-xs p-3 rounded whitespace-pre-wrap break-all">
          {latest.context ? JSON.stringify(latest.context, null, 2) : "(없음)"}
        </pre>
      </div>

      {/* Meta */}
      <div className="text-xs text-white/50 space-y-1">
        {latest.fingerprint && <div>fingerprint: <code className="text-white/70">{latest.fingerprint}</code></div>}
        {latest.user_id && <div>user_id: <code className="text-white/70">{latest.user_id}</code></div>}
        {latest.anonymous_id && <div>anonymous_id: <code className="text-white/70">{latest.anonymous_id}</code></div>}
        {latest.ip && <div>ip: <code className="text-white/70">{latest.ip}</code></div>}
        {latest.user_agent && <div className="break-all">user_agent: <code className="text-white/70">{latest.user_agent}</code></div>}
      </div>

      {/* Recent occurrences */}
      <div>
        <h2 className="text-sm font-semibold text-white/60 mb-2">최근 발생 목록 (최대 20건)</h2>
        <table className="w-full text-xs">
          <thead className="text-white/40 text-left">
            <tr>
              <th className="py-1 pr-3">시각</th>
              <th className="py-1 pr-3">라우트</th>
              <th className="py-1">상태</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id} className="border-t border-white/10">
                <td className="py-1 pr-3 text-white/60 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                </td>
                <td className="py-1 pr-3 text-white/50">{r.route ?? "—"}</td>
                <td className="py-1">
                  {r.resolved_at ? (
                    <span className="text-white/30">해결됨</span>
                  ) : (
                    <span className="text-red-400">미해결</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
