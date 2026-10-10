// components/admin/daily/AlertStrip.tsx — 고장 신호 한 줄 모음. 보여줄 게 없으면 블록 자체를 그리지 않는다.
import Link from "next/link";

export function AlertStrip({
  unresolvedErrors, unreviewedSensitive, alertsFailed, syncAlert,
}: { unresolvedErrors: number; unreviewedSensitive: number; alertsFailed: boolean; syncAlert: string | null }) {
  const lines: { text: string; href?: string; tone: "red" | "amber" }[] = [];
  if (unresolvedErrors > 0) lines.push({ text: `미해결 에러 ${unresolvedErrors}건`, href: "/admin/errors", tone: "red" });
  if (unreviewedSensitive > 0) lines.push({ text: `미검토 민감 알림 ${unreviewedSensitive}건`, href: "/admin/sensitive", tone: "red" });
  if (alertsFailed) lines.push({ text: "에러·민감 알림 조회 실패", tone: "amber" });
  if (syncAlert) lines.push({ text: syncAlert, href: "/admin/ads", tone: "red" });
  if (lines.length === 0) return null;
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-1.5">
      {lines.map((l) => {
        const cls = `text-[13px] break-words [overflow-wrap:anywhere] ${l.tone === "red" ? "text-red-400" : "text-amber-300/80"}`;
        return l.href ? (
          <Link key={l.text} href={l.href} className={`block underline ${cls}`}>{l.text}</Link>
        ) : (
          <div key={l.text} className={cls}>{l.text}</div>
        );
      })}
    </div>
  );
}
