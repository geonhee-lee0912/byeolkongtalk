// app/admin/traffic/page.tsx — 페이지뷰 비콘(page_views) 기반 UV/PV.
// 1순위 질문: "유저가 어느 라우트에서 사라지는가". Meta 픽셀은 광고 상단(→랜딩→가입)까지만
// 보여주므로 가입 이후 앱 내부 이탈은 이 화면 말고 볼 수단이 없다 → 라우트별 표가 이 화면의 핵심.
import { headers } from "next/headers";
import { LineChart } from "@/components/admin/LineChart";
import LoadFailed from "@/components/admin/LoadFailed";
import { Stat, Delta } from "@/components/admin/Stat";
import { routeLabel } from "@/lib/analytics/route-labels";
import { pickTodayYesterday, pickTodayVisitorMix } from "@/lib/analytics/traffic";
import type {
  TrafficPoint,
  BotShare,
  RouteRow,
  AuthSplitRow,
  EntryRow,
  WithToday,
  VisitorMixPoint,
} from "@/lib/analytics/traffic";

export const dynamic = "force-dynamic";

const SEGMENT_LABEL: Record<string, string> = { guest: "비로그인", member: "로그인" };


// 실패는 null 로 돌려준다 — 호출부가 "값이 진짜 0" 과 "조회가 죽었다" 를 구분할 수 있어야 한다.
// 예외(네트워크·JSON 파싱)도 여기서 삼켜 null 로 바꾼다: 페이지를 통째로 죽이는 대신 화면에 드러낸다.
async function api(path: string) {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    const cookie = h.get("cookie") ?? "";
    const res = await fetch(`${proto}://${host}${path}`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    // 라우트가 200 으로 { error } 를 실어 보낼 수도 있다 — 그것도 실패로 센다.
    return json && typeof json === "object" && "error" in json ? null : json;
  } catch {
    return null;
  }
}

export default async function TrafficPage() {
  const days = 30;
  const data = await api(`/api/admin/traffic?days=${days}`);
  // 이 화면의 5개 지표는 전부 라우트 하나에서 온다(RPC 7개를 한 번에 묶어 500 으로 되돌린다) →
  // 실패 단위도 라우트 하나다. 실패하면 아래 `?? []`·`?? 0` 폴백이 0·빈 표로 위장하므로 막는다.
  const failed = data === null;
  const trend: TrafficPoint[] = data?.trend ?? [];
  const bot: BotShare = data?.bot ?? { totalPv: 0, botPv: 0, botPct: 0 };
  const routes: WithToday<RouteRow>[] = data?.routes ?? [];
  const auth: WithToday<AuthSplitRow>[] = data?.auth ?? [];
  const variants: EntryRow[] = data?.entry?.variants ?? [];
  const contents: EntryRow[] = data?.entry?.contents ?? [];
  const entryTruncated: boolean = data?.entry?.truncated ?? false;
  // 라우트에서 이미 buildVisitorMix 를 거쳐 returningPct 가 붙어 온다 — 여기서 다시 부르지 않는다.
  const visitorMix: VisitorMixPoint[] = data?.visitorMix ?? [];
  // 추세 마지막 두 점이 오늘·어제 버킷 (빈 데이터면 둘 다 0 → Delta 가 "어제 0")
  const { today, yesterday } = pickTodayYesterday(trend);
  // 오늘 카드 서브라인 — 방문자 구성의 마지막 점이 오늘 버킷.
  const mixToday = pickTodayVisitorMix(visitorMix);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-bold">
          트래픽 <span className="text-white/40 text-sm">(최근 {days}일)</span>
        </h1>
        {/* 계측 건강성 한 줄 — 봇 PV 가 갑자기 치솟으면 아래 숫자 해석 자체를 의심해야 한다 */}
        <p className="text-[12px] text-white/40 mt-1">
          UV = 구별되는 방문자(anon_id) · 봇 제외 집계 · 날짜는 <b>KST 자정</b> 기준(어드민 전 화면 동일) ·
          수집된 전체 PV {failed ? "—" : bot.totalPv.toLocaleString()}건 중 봇{" "}
          {failed ? "—" : bot.botPv.toLocaleString()}건 ({failed ? "—" : bot.botPct}%)
        </p>
        {/* 실패 한 줄은 여기 한 번 — 바로 아래 「오늘」 카드의 `—` 까지 이 줄이 설명한다 */}
        {failed && <LoadFailed block="/api/admin/traffic" className="mt-2" />}
      </div>

      {/* 실패했을 때 "아직 수집된 데이터가 없습니다" 는 거짓말이다 — 성공했을 때만 띄운다 */}
      {!failed && bot.totalPv === 0 && (
        <div className="rounded-lg bg-white/5 p-4 text-[13px] text-white/60">
          아직 수집된 데이터가 없습니다. 페이지뷰 비콘이 배포된 뒤 라우트 이동이 발생하면 채워집니다.
        </div>
      )}

      <section>
        <h2 className="text-sm text-white/60 mb-3">
          오늘 <span className="text-white/35">(KST 자정 기준 · 어제 대비)</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 md:max-w-lg">
          <Stat
            label="오늘 UV"
            value={failed ? "—" : today.uv.toLocaleString()}
            sub={
              !failed && mixToday.uv > 0 ? (
                // 🔴 구성의 분모는 위 UV 와 다르다 — UV 는 페이지뷰 귀속, 구성은 세션 시작 귀속.
                //    분모를 함께 적어야 "신규+연속+복귀 가 UV 와 안 맞는다"는 오독을 막는다.
                <>
                  구성(세션 {mixToday.uv.toLocaleString()}) 신규{" "}
                  {mixToday.newUv.toLocaleString()} · 연속{" "}
                  {mixToday.streakUv.toLocaleString()} · 복귀{" "}
                  {mixToday.backUv.toLocaleString()} · 재방문 {mixToday.returningPct}%
                </>
              ) : undefined
            }
          >
            {/* 실패 시 증감을 만들지 않는다 — 없는 값으로 계산한 "어제 0" 이 또 하나의 거짓말이다 */}
            {!failed && <Delta today={today.uv} yesterday={yesterday.uv} />}
          </Stat>
          <Stat label="오늘 PV" value={failed ? "—" : today.pv.toLocaleString()}>
            {!failed && <Delta today={today.pv} yesterday={yesterday.pv} />}
          </Stat>
        </div>
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">일별 UV / PV</h2>
        {failed ? (
          <LoadFailed block="/api/admin/traffic" />
        ) : (
          <LineChart
            labels={trend.map((p) => p.date)}
            series={[
              { label: "UV", color: "#E8C26A", values: trend.map((p) => p.uv) },
              { label: "PV", color: "#B8A8D8", values: trend.map((p) => p.pv) },
            ]}
          />
        )}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">
          방문자 구성{" "}
          <span className="text-white/40 text-xs">
            (신규 = 기록상 첫 방문 · 연속 = 어제도 왔고 오늘도 · 복귀 = 며칠 만에 돌아옴 · 셋의 합 =
            그날 방문자 수)
          </span>
          <span className="block text-white/35 text-[11px] font-normal mt-1">
            ⚠️ 이 표의 방문자 수는 <b>세션 시작 귀속</b>(30분 공백이면 새 세션 · 세션 시작 날짜에 귀속)
            이라 위 「일별 UV / PV」의 UV(<b>페이지뷰 귀속</b>)와 하루 1명 수준으로 다를 수 있습니다 —
            자정을 걸친 세션을 두 날로 쪼개지 않기 위한 것으로, 둘은 같은 값이 아닙니다.
          </span>
        </h2>
        {failed ? (
          <LoadFailed block="/api/admin/traffic" />
        ) : (
          <>
            <LineChart
              labels={visitorMix.map((p) => p.date)}
              series={[
                { label: "신규", color: "#E8C26A", values: visitorMix.map((p) => p.newUv) },
                { label: "연속", color: "#6EE7B7", values: visitorMix.map((p) => p.streakUv) },
                { label: "복귀", color: "#B8A8D8", values: visitorMix.map((p) => p.backUv) },
              ]}
            />
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-[13px] md:max-w-2xl">
                <thead className="text-white/50 text-left">
                  <tr>
                    <th className="py-1">날짜</th>
                    <th>UV</th>
                    <th>신규</th>
                    <th>연속</th>
                    <th>복귀</th>
                    <th className="border-l border-white/15 pl-2 text-white/70">재방문율</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 최신순 — 순위표가 아니라 날짜표라 최신이 위가 맞다 */}
                  {[...visitorMix]
                    .reverse()
                    .slice(0, 14)
                    .map((p) => (
                      <tr key={p.date} className="border-t border-white/10">
                        <td className="py-1.5 tabular-nums">{p.date.slice(5)}</td>
                        <td className="tabular-nums">{p.uv.toLocaleString()}</td>
                        <td className="tabular-nums">{p.newUv.toLocaleString()}</td>
                        <td className="tabular-nums">{p.streakUv.toLocaleString()}</td>
                        <td className="tabular-nums">{p.backUv.toLocaleString()}</td>
                        <td className="border-l border-white/15 pl-2 tabular-nums">
                          {p.returningPct}%
                        </td>
                      </tr>
                    ))}
                  {visitorMix.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-2 text-white/30">
                        데이터 없음
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-white/30 mt-2">
              차트는 최근 {days}일 전체, 표는 최근 14일. · 2026-07-25 이전 방문 기록이 없어(비콘 배포일)
              수집 초기 며칠은 신규가 과대 집계된다. · 쿠키 삭제 · 시크릿창 · 기기 변경은 재방문을 신규로
              세므로 재방문은 과소 추정이다.
            </p>
          </>
        )}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">
          라우트별 UV · PV{" "}
          <span className="text-white/40 text-xs">
            (상위 {failed ? "—" : routes.length}개 · {days}일 PV 많은 순 · 앞 단계 대비 UV 가 크게 떨어지는 라우트 =
            이탈 지점 · PV/UV 는 재방문 강도)
          </span>
        </h2>
        {failed ? (
          <LoadFailed block="/api/admin/traffic" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-white/50 text-left">
                  <tr>
                    <th className="py-1 w-8 text-right pr-2">#</th>
                    <th className="py-1">라우트</th>
                    <th>UV</th>
                    <th>PV</th>
                    {/* PV/UV 는 지표 이름이라 UV·PV 순서 통일에서 제외 — 뒤집으면 다른 지표가 된다 */}
                    <th>PV/UV</th>
                    {/* 오늘 열은 구분선으로 기간 열과 갈라둔다 — 안 가르면 5개 숫자가 한 덩어리로 읽힌다 */}
                    <th className="border-l border-white/15 pl-2 text-white/70">오늘 UV</th>
                    <th className="text-white/70">오늘 PV</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r, i) => (
                    <tr key={r.path} className="border-t border-white/10">
                      <td className="py-1.5 text-right pr-2 text-white/35 tabular-nums">{i + 1}</td>
                      <td className="py-1.5">
                        <div>{routeLabel(r.path)}</div>
                        <div className="font-mono text-[11px] text-white/35">{r.path}</div>
                      </td>
                      <td>{r.uv.toLocaleString()}</td>
                      <td>{r.pv.toLocaleString()}</td>
                      <td>{r.pvPerUv}</td>
                      <td className="border-l border-white/15 pl-2">{r.todayUv.toLocaleString()}</td>
                      <td>{r.todayPv.toLocaleString()}</td>
                    </tr>
                  ))}
                  {routes.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-2 text-white/30">
                        데이터 없음
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-white/30 mt-2">
              순위·행 구성은 {days}일 PV 기준이라, 오늘만 트래픽이 있고 {days}일 상위 {routes.length}개에
              못 든 라우트는 이 표에 안 나온다.
            </p>
          </>
        )}
      </section>

      <section className="max-w-xl">
        <h2 className="text-sm text-white/60 mb-3">
          로그인 전 / 후{" "}
          <span className="text-white/40 text-xs">
            (가입 순간 같은 방문자가 양쪽에 잡히므로 UV 합은 전체보다 클 수 있음)
          </span>
        </h2>
        {failed ? (
          <LoadFailed block="/api/admin/traffic" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-white/50 text-left">
                <tr>
                  <th className="py-1">구분</th>
                  <th>UV</th>
                  <th>PV</th>
                  <th className="border-l border-white/15 pl-2 text-white/70">오늘 UV</th>
                  <th className="text-white/70">오늘 PV</th>
                </tr>
              </thead>
              <tbody>
                {auth.map((r) => (
                  <tr key={r.segment} className="border-t border-white/10">
                    <td className="py-1.5">{SEGMENT_LABEL[r.segment] ?? r.segment}</td>
                    <td>{r.uv.toLocaleString()}</td>
                    <td>{r.pv.toLocaleString()}</td>
                    <td className="border-l border-white/15 pl-2">{r.todayUv.toLocaleString()}</td>
                    <td>{r.todayPv.toLocaleString()}</td>
                  </tr>
                ))}
                {auth.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-2 text-white/30">
                      데이터 없음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">
          유입별{" "}
          <span className="text-white/40 text-xs">
            (방문자의 최초 유입값으로 그 방문자의 PV 전체를 귀속)
          </span>
        </h2>
        {failed ? (
          <LoadFailed block="/api/admin/traffic" />
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <EntryTable title="랜딩 variant (?v=)" rows={variants} />
            <EntryTable title="광고 소재 (utm_content)" rows={contents} />
          </div>
        )}
        {entryTruncated && (
          <p className="text-[12px] text-amber-300/80 mt-3">
            ⚠️ 소재 종수가 조회 상한(200)에 닿아 표가 전부를 보여주지 못한다. 상한을 올리거나 소재
            키를 정리할 것 — 조용히 잘리지 않게 이 줄을 띄운다.
          </p>
        )}
        <p className="text-[11px] text-white/30 mt-3">
          <span className="text-white/45">(매크로 미치환)</span> = Meta 가{" "}
          <span className="font-mono">{"{{ad.name}}"}</span> 을 실제 소재명으로 바꾸지 않은 채 도착한
          유입. 매크로는 클릭 시점에 치환되므로, 광고 미리보기 링크 · 광고 관리자에서 목적지 URL 을
          복사해 직접 열기 · 광고 게시물의 오가닉 공유 경로에서 생긴다. 실제 소재가 아니라 계측
          누락이므로 소재 성과에서 빼고 볼 것.
        </p>
      </section>
    </div>
  );
}

// "오늘" 열이 없다 — 30일 first-touch 를 그대로 쓸지(오늘 움직인 사람의 출신) 오늘 행만으로
// 다시 귀속할지(오늘 광고 타고 온 사람)에 따라 값이 갈리는데, 후자는 광고 유입자가 오가닉으로
// 재방문할수록 (직접/오가닉)을 부풀려 "오가닉이 늘었다"로 오독된다. 애매한 지표를 남기는 대신
// 열을 뺐다(2026-07-29). 일일 광고 유입은 /admin/ads 와 Meta 광고관리자가 본다.
function EntryTable({ title, rows }: { title: string; rows: EntryRow[] }) {
  return (
    <div>
      <h3 className="text-sm text-white/70 mb-2">{title}</h3>
      <div className="overflow-x-auto">
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
    </div>
  );
}
