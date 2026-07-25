// app/admin/traffic/page.tsx — 페이지뷰 비콘(page_views) 기반 UV/PV.
// 1순위 질문: "유저가 어느 라우트에서 사라지는가". Meta 픽셀은 광고 상단(→랜딩→가입)까지만
// 보여주므로 가입 이후 앱 내부 이탈은 이 화면 말고 볼 수단이 없다 → 라우트별 표가 이 화면의 핵심.
import { headers } from "next/headers";
import { LineChart } from "@/components/admin/LineChart";
import { Stat, Delta } from "@/components/admin/Stat";
import { routeLabel } from "@/lib/analytics/route-labels";
import { pickTodayYesterday } from "@/lib/analytics/traffic";
import type {
  TrafficPoint,
  BotShare,
  RouteRow,
  AuthSplitRow,
  EntryRow,
} from "@/lib/analytics/traffic";

export const dynamic = "force-dynamic";

const SEGMENT_LABEL: Record<string, string> = { guest: "비로그인", member: "로그인" };


async function api(path: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const cookie = h.get("cookie") ?? "";
  const res = await fetch(`${proto}://${host}${path}`, {
    headers: { cookie },
    cache: "no-store",
  });
  return res.ok ? res.json() : null;
}

export default async function TrafficPage() {
  const days = 30;
  const data = await api(`/api/admin/traffic?days=${days}`);
  const trend: TrafficPoint[] = data?.trend ?? [];
  const bot: BotShare = data?.bot ?? { totalPv: 0, botPv: 0, botPct: 0 };
  const routes: RouteRow[] = data?.routes ?? [];
  const auth: AuthSplitRow[] = data?.auth ?? [];
  const variants: EntryRow[] = data?.entry?.variants ?? [];
  const contents: EntryRow[] = data?.entry?.contents ?? [];
  // 추세 마지막 두 점이 오늘·어제 버킷 (빈 데이터면 둘 다 0 → Delta 가 "어제 0")
  const { today, yesterday } = pickTodayYesterday(trend);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-bold">
          트래픽 <span className="text-white/40 text-sm">(최근 {days}일)</span>
        </h1>
        {/* 계측 건강성 한 줄 — 봇 PV 가 갑자기 치솟으면 아래 숫자 해석 자체를 의심해야 한다 */}
        <p className="text-[12px] text-white/40 mt-1">
          UV = 구별되는 방문자(anon_id) · 봇 제외 집계 · 날짜는 오전 10시 롤오버(대시보드와 동일) ·
          수집된 전체 PV {bot.totalPv.toLocaleString()}건 중 봇{" "}
          {bot.botPv.toLocaleString()}건 ({bot.botPct}%)
        </p>
      </div>

      {bot.totalPv === 0 && (
        <div className="rounded-lg bg-white/5 p-4 text-[13px] text-white/60">
          아직 수집된 데이터가 없습니다. 페이지뷰 비콘이 배포된 뒤 라우트 이동이 발생하면 채워집니다.
        </div>
      )}

      <section>
        <h2 className="text-sm text-white/60 mb-3">
          오늘 <span className="text-white/35">(오전 10시 기준 · 어제 대비)</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 md:max-w-lg">
          <Stat label="오늘 UV" value={today.uv.toLocaleString()}>
            <Delta today={today.uv} yesterday={yesterday.uv} />
          </Stat>
          <Stat label="오늘 PV" value={today.pv.toLocaleString()}>
            <Delta today={today.pv} yesterday={yesterday.pv} />
          </Stat>
        </div>
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">일별 UV / PV</h2>
        <LineChart
          labels={trend.map((p) => p.date)}
          series={[
            { label: "UV", color: "#E8C26A", values: trend.map((p) => p.uv) },
            { label: "PV", color: "#B8A8D8", values: trend.map((p) => p.pv) },
          ]}
        />
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">
          라우트별 PV · UV{" "}
          <span className="text-white/40 text-xs">
            (상위 {routes.length}개 · 앞 단계 대비 UV 가 크게 떨어지는 라우트 = 이탈 지점 ·
            PV/UV 는 재방문 강도)
          </span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-white/50 text-left">
              <tr>
                <th className="py-1">라우트</th>
                <th>PV</th>
                <th>UV</th>
                <th>PV/UV</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={r.path} className="border-t border-white/10">
                  <td className="py-1.5">
                    <div>{routeLabel(r.path)}</div>
                    <div className="font-mono text-[11px] text-white/35">{r.path}</div>
                  </td>
                  <td>{r.pv.toLocaleString()}</td>
                  <td>{r.uv.toLocaleString()}</td>
                  <td>{r.pvPerUv}</td>
                </tr>
              ))}
              {routes.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-2 text-white/30">
                    데이터 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-md">
        <h2 className="text-sm text-white/60 mb-3">
          로그인 전 / 후{" "}
          <span className="text-white/40 text-xs">
            (가입 순간 같은 방문자가 양쪽에 잡히므로 UV 합은 전체보다 클 수 있음)
          </span>
        </h2>
        <table className="w-full text-[13px]">
          <thead className="text-white/50 text-left">
            <tr>
              <th className="py-1">구분</th>
              <th>UV</th>
              <th>PV</th>
            </tr>
          </thead>
          <tbody>
            {auth.map((r) => (
              <tr key={r.segment} className="border-t border-white/10">
                <td className="py-1.5">{SEGMENT_LABEL[r.segment] ?? r.segment}</td>
                <td>{r.uv.toLocaleString()}</td>
                <td>{r.pv.toLocaleString()}</td>
              </tr>
            ))}
            {auth.length === 0 && (
              <tr>
                <td colSpan={3} className="py-2 text-white/30">
                  데이터 없음
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">
          유입별{" "}
          <span className="text-white/40 text-xs">
            (방문자의 최초 유입값으로 그 방문자의 PV 전체를 귀속)
          </span>
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          <EntryTable title="랜딩 variant (?v=)" rows={variants} />
          <EntryTable title="광고 소재 (utm_content)" rows={contents} />
        </div>
      </section>
    </div>
  );
}

function EntryTable({ title, rows }: { title: string; rows: EntryRow[] }) {
  return (
    <div>
      <h3 className="text-sm text-white/70 mb-2">{title}</h3>
      <table className="w-full text-[12px]">
        <thead className="text-white/40 text-left">
          <tr>
            <th className="py-1">유입</th>
            <th>UV</th>
            <th>PV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-white/10">
              <td className="py-1">{r.key}</td>
              <td>{r.uv.toLocaleString()}</td>
              <td>{r.pv.toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="py-2 text-white/30">
                데이터 없음
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
