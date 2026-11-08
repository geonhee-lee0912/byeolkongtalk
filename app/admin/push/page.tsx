// app/admin/push/page.tsx — 앱 알림 성과. 설계 docs/superpowers/specs/2026-11-06-앱-알림-design.md §1 '잴 것'.
// 화면 순서 = 알림의 흐름: 지금 상태 → 묻기(허용률) → 광고 동의·철회 → 보낸 알림(열람·수신거부) → 다시 볼 날.
// 데이터는 /api/admin/push(requireAdmin) 가 admin_push_* RPC 로 집계해 준다. 비율의 분모가 0 이면 '—'(잴 수 없음).
import { headers } from "next/headers";
import LoadFailed from "@/components/admin/LoadFailed";
import { Stat } from "@/components/admin/Stat";
import { formatPercentOrDash } from "@/lib/admin/format";
import {
  askTable, consentTable, KIND_LABEL, label, MOMENT_LABEL, revisitSummary, sendsByDay, sendTotals, SOURCE_LABEL,
  type AskRow, type ConsentRow, type RevisitRow, type SendRow,
} from "@/lib/admin/push-stats";

export const dynamic = "force-dynamic";

type Summary = {
  device_users: number; devices: number; ad_granted: number; ad_withdrawn: number;
  revisit_off: number; morning_off: number; opened_app_7d: number;
};

async function load() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const cookie = h.get("cookie") ?? "";
  try {
    const res = await fetch(`${proto}://${host}/api/admin/push`, { headers: { cookie }, cache: "no-store" });
    if (res.ok) return (await res.json()) as Record<string, unknown>;
  } catch {
    // 아래 실패 기본값
  }
  return null;
}

const th = "text-left font-medium text-white/60 px-3 py-2 whitespace-nowrap";
const td = "px-3 py-2 whitespace-nowrap";

export default async function AdminPushPage() {
  const j = await load();
  const failed = (k: string) => !j || !!j[`${k}Error`];
  const windowDays = Number(j?.windowDays ?? 30);
  const s = (j?.summary ?? null) as Summary | null;
  const asks = (j?.asks ?? []) as AskRow[];
  const askRows = askTable(asks);
  const consentRows = consentTable((j?.consent ?? []) as ConsentRow[], asks);
  const sendRows = (j?.sends ?? []) as SendRow[];
  const totals = sendTotals(sendRows);
  const days = sendsByDay(sendRows);
  const rv = revisitSummary((j?.revisit ?? []) as RevisitRow[]);
  const num = (v: unknown) => (failed("summary") ? "—" : Number(v ?? 0).toLocaleString());

  return (
    <div className="space-y-8 max-w-5xl">
      <header>
        <h1 className="text-xl font-bold">앱 알림</h1>
        <p className="text-[12px] text-white/50 mt-1">
          지금 상태를 뺀 나머지는 최근 {windowDays}일(KST, 오늘 포함). 어드민 계정은 뺐다. 비율의 분모가 0 이면 —.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-[15px] font-bold">지금 상태</h2>
        {failed("summary") && <LoadFailed block="admin_push_summary" />}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="알림 받는 회원(로그인된 기기)" value={num(s?.device_users)} sub={`기기 ${num(s?.devices)}대`} />
          <Stat label="광고 수신 동의 중" value={num(s?.ad_granted)} sub={`철회 ${num(s?.ad_withdrawn)}명`} />
          <Stat label="최근 7일 앱을 연 회원" value={num(s?.opened_app_7d)} />
          <Stat label="아침 별 흐름을 끈 회원" value={num(s?.morning_off)} sub={`다시 볼 날을 끈 회원 ${num(s?.revisit_off)}`} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-bold">묻는 순간별 답 — 알림 허용률</h2>
        <p className="text-[12px] text-white/50">허용률 = 받아들임 / 물은 수. '휴대폰 거부'는 우리 시트에선 받아들였지만 OS 창에서 거부한 것.</p>
        {failed("asks") ? (
          <LoadFailed block="admin_push_asks" />
        ) : askRows.length === 0 ? (
          <p className="text-[13px] text-white/40">아직 기록이 없다.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-[13px]">
              <thead className="bg-white/5"><tr>
                <th className={th}>순간</th><th className={th}>물은 것</th><th className={th}>물은 수</th>
                <th className={th}>받아들임</th><th className={th}>나중에</th><th className={th}>휴대폰 거부</th><th className={th}>허용률</th>
              </tr></thead>
              <tbody>
                {askRows.map((r) => (
                  <tr key={`${r.moment}-${r.kind}`} className="border-t border-white/5">
                    <td className={td}>{label(MOMENT_LABEL, r.moment)}</td>
                    <td className={td}>{r.kind === "ad" ? "광고 동의만" : "알림 켜기"}</td>
                    <td className={td}>{r.total.toLocaleString()}</td>
                    <td className={td}>{r.accepted.toLocaleString()}</td>
                    <td className={td}>{r.later.toLocaleString()}</td>
                    <td className={td}>{r.osDenied.toLocaleString()}</td>
                    <td className={`${td} font-bold`}>{formatPercentOrDash(r.acceptRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-bold">광고 수신 동의·철회 — 어디서</h2>
        <p className="text-[12px] text-white/50">동의율 = 그 순간의 동의 / 그 순간에 물은 수(묻는 시트가 있는 순간만).</p>
        {failed("consent") ? (
          <LoadFailed block="admin_push_consent" />
        ) : consentRows.length === 0 ? (
          <p className="text-[13px] text-white/40">아직 기록이 없다.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-[13px]">
              <thead className="bg-white/5"><tr>
                <th className={th}>어디서</th><th className={th}>동의</th><th className={th}>철회</th><th className={th}>물은 수</th><th className={th}>동의율</th>
              </tr></thead>
              <tbody>
                {consentRows.map((r) => (
                  <tr key={r.source} className="border-t border-white/5">
                    <td className={td}>{label(SOURCE_LABEL, r.source)}</td>
                    <td className={td}>{r.grant.toLocaleString()}</td>
                    <td className={td}>{r.withdraw.toLocaleString()}</td>
                    <td className={td}>{r.asked === null ? "—" : r.asked.toLocaleString()}</td>
                    <td className={`${td} font-bold`}>{formatPercentOrDash(r.grantRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-bold">보낸 알림 — 종류별 열람률·수신거부율</h2>
        <p className="text-[12px] text-white/50">열람 = 알림을 누르고 앱이 열린 것(웹이 기록). 수신거부율은 광고만.</p>
        {failed("sends") ? (
          <LoadFailed block="admin_push_sends_daily" />
        ) : totals.length === 0 ? (
          <p className="text-[13px] text-white/40">아직 보낸 알림이 없다.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-[13px]">
                <thead className="bg-white/5"><tr>
                  <th className={th}>종류</th><th className={th}>분류</th><th className={th}>보냄</th><th className={th}>열람</th>
                  <th className={th}>열람률</th><th className={th}>수신거부</th><th className={th}>수신거부율</th>
                </tr></thead>
                <tbody>
                  {totals.map((r) => (
                    <tr key={`${r.kind}-${r.klass}`} className="border-t border-white/5">
                      <td className={td}>{label(KIND_LABEL, r.kind)}</td>
                      <td className={td}>{r.klass === "ad" ? "광고" : "정보성"}</td>
                      <td className={td}>{r.sent.toLocaleString()}</td>
                      <td className={td}>{r.opened.toLocaleString()}</td>
                      <td className={`${td} font-bold`}>{formatPercentOrDash(r.openRate)}</td>
                      <td className={td}>{r.klass === "ad" ? r.unsubscribed.toLocaleString() : "—"}</td>
                      <td className={td}>{formatPercentOrDash(r.unsubRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-[13px]">
                <thead className="bg-white/5"><tr>
                  <th className={th}>날짜(KST)</th><th className={th}>정보성</th><th className={th}>광고</th><th className={th}>열람</th>
                </tr></thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.day} className="border-t border-white/5">
                      <td className={td}>{d.day}</td>
                      <td className={td}>{d.info.toLocaleString()}</td>
                      <td className={td}>{d.ad.toLocaleString()}</td>
                      <td className={td}>{d.opened.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-bold">다시 볼 날</h2>
        <p className="text-[12px] text-white/50">이 기간에 만든 예약. 보낸 비율 = 보냄 / (보냄 + 건너뜀 — 그날 기기·설정이 없어 못 보냄). 그날 돌아온 비율은 위 표 '다시 볼 날' 열람률.</p>
        {failed("revisit") ? (
          <LoadFailed block="admin_push_revisit" />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="예약" value={rv.total.toLocaleString()} sub={`기다림 ${rv.pending} · 보냄 ${rv.sent} · 건너뜀 ${rv.skipped}`} />
            <Stat label="보낸 비율" value={formatPercentOrDash(rv.deliveredRate)} />
            <Stat
              label="고른 간격"
              value={rv.gaps.length ? rv.gaps.map((g) => `${g.days}일 ${g.cnt}`).join(" · ") : "—"}
            />
          </div>
        )}
      </section>
    </div>
  );
}
