// app/admin/roadmap/page.tsx — 3층. 주 1회 읽는 판정 화면.
//
// 1·2층이 "지금 무슨 일이 일어나고 있나"라면 여기는 "그래서 이 변경이 성공인가"에 답한다.
// 베이스라인·목표선·판정 규칙을 **화면에 박아** 기억에 의존하지 않게 한다.
//
// 가드는 `app/admin/layout.tsx`(화이트리스트 + HMAC) + `proxy.ts` 가 진다 — 어드민 화면의
// 기존 관례대로 페이지 자체 가드는 두지 않는다(AGENTS.md "나머지 14화면은 proxy 가 유일한 문").
import { getServiceSupabase } from "@/lib/supabase";
import { adminExclusionArray } from "@/lib/admin";
import LoadFailed from "@/components/admin/LoadFailed";
import { BlockNote } from "@/components/admin/BlockNote";
import { formatMetric } from "@/lib/admin/format";
import { STATUS } from "@/lib/admin/colors";
import { MIN_SAMPLE } from "@/lib/admin-metrics";
import {
  ROADMAP_KPIS,
  judge,
  HOLIDAYS_2026,
  parseRoadmapWindow,
  type Verdict,
} from "@/lib/admin/roadmap";

export const dynamic = "force-dynamic";

/** 🔴 색은 `lib/admin/colors.ts` 가 정본. color=null 인 칸은 동적 색 없이 정적 클래스로 그린다. */
const VERDICT_STYLE: Record<Verdict, { color: string | null; label: string }> = {
  good: { color: STATUS.good, label: "달성" },
  watch: { color: STATUS.warning, label: "관찰" },
  bad: { color: STATUS.critical, label: "경보" },
  ref: { color: null, label: "참고" },
  unknown: { color: null, label: "—" },
};

const GROUPS = [
  { key: "primary", label: "Primary" },
  { key: "welcome15", label: "웰컴 15" },
  { key: "turnclose", label: "턴마무리" },
  { key: "byeolmaru", label: "별마루" },
  { key: "guardrail", label: "가드레일" },
  { key: "ref", label: "참고" },
] as const;

export default async function RoadmapPage({
  searchParams,
}: {
  // Next 16: searchParams 는 Promise 다.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // 🔴 창은 **항상 닫혀서** 넘어간다 — admin_roadmap_kpi 는 p_until 이 NULL 이면 에러가 아니라
  //    조용히 코호트 0명이 된다. 근거·방어는 parseRoadmapWindow 의 주석 참조.
  const win = parseRoadmapWindow(sp);
  // 🔴 전제: `ADMIN_USER_IDS`(어드민) == 로드맵이 말하는 "지인 6명". 개념이 다른 두 목록인데
  //    prod 에서는 같은 사람들이라고 사용자가 확인했고(2026-09-27), Task 15 가 그 6개 8자
  //    prefix 가 각각 정확히 1명이고 전체 UUID 집합과 양방향 차이 0 임을 실측했다.
  //    ⚠️ 어드민을 추가하거나 지인이 빠지면 그 순간부터 **베이스라인과 갈린다** — 아래 "제외 N명"
  //    이 6이 아니면 그 사실이 화면에 드러난다(로컬은 env 가 없어 0명으로 뜬다).
  const exclude = adminExclusionArray();
  const supa = getServiceSupabase();
  const res = await supa.rpc("admin_roadmap_kpi", {
    p_since: win.since,
    p_until: win.until,
    p_exclude: exclude,
    p_holidays: [...HOLIDAYS_2026],
  });

  const failed = Boolean(res.error);
  const row = ((res.data ?? []) as Record<string, string | null>[])[0];
  // 🔴 `?? 0` 으로 뭉개지 않는다 — 조회 실패와 진짜 0 은 다른 사실이다(LoadFailed 헤더 주석).
  const users = failed || row === undefined ? null : Number(row.users ?? 0);
  const d7Eligible = failed || row === undefined ? null : Number(row.d7_eligible ?? 0);

  const n = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("ko-KR")}명`);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">판정 — 흑자 전환 로드맵 v2</h1>
      <div className="text-[12px] text-white/50 leading-relaxed">
        창 {win.since.slice(0, 10)} ~ {win.until.slice(0, 10)} (가입 코호트 · KST 반개구간) · 코호트{" "}
        <b className="text-white/75">{n(users)}</b> · 공휴일 가입 {HOLIDAYS_2026.length}일 제외 ·
        지인/어드민 {exclude.length}명 제외
        <br />
        로드맵 §3 &ldquo;읽는 법&rdquo;: 결제는 즉시 성숙(결제 p90 49분),{" "}
        <b className="text-white/70">D7 은 7일 대기</b> — 현재 성숙 분모 {n(d7Eligible)}.
        <br />
        {/* 🔴 JSX 텍스트에 백틱·별표를 쓰지 않는다 — 마크다운이 아니라 날것으로 찍힌다.
            강조는 태그로. (같은 결함이 이 리포에서 `4a17c2d` 로 이미 한 번 고쳐졌다.) */}
        판정 규칙 정본 ={" "}
        <b className="text-white/70">plans/2026-09-19-흑자전환-로드맵-v2-별마루배포포함.md</b> §1·§3.
        배포 후 지표를 바꾸지 않는다.
      </div>

      {failed && <LoadFailed block="판정 KPI(admin_roadmap_kpi)" />}

      {/* 🔴 0명은 "가입이 없었다"가 아닐 수 있다 — 창이 뒤집혔거나 제외가 과했을 때도 같은 화면이
          나온다. 판정 화면에서 가장 조용한 오독이라 명시적으로 말한다. */}
      {!failed && users === 0 && (
        <p className="text-[12px] text-amber-300/80">
          ⚠️ 이 창의 코호트가 0명이다 — 아래 판정은 전부 근거가 없다. 창 방향(since &lt; until)과
          제외 목록({exclude.length}명)을 먼저 확인할 것.
        </p>
      )}

      {exclude.length === 0 && (
        <p className="text-[12px] text-amber-300/80">
          ⚠️ 제외 목록이 비어 있다(<b>ADMIN_USER_IDS</b> 미설정) — 지인 6명이 분모·분자에 섞여 있어
          베이스라인과 직접 비교되지 않는다. 로컬에서 흔한 상태다.
        </p>
      )}

      {!failed &&
        GROUPS.map((grp) => {
          const items = ROADMAP_KPIS.filter((k) => k.group === grp.key);
          if (items.length === 0) return null;
          return (
            <section key={grp.key}>
              <h2 className="text-sm text-white/60 mb-2">{grp.label}</h2>
              <div className="space-y-2">
                {items.map((k) => {
                  const raw = row?.[k.column];
                  const value = raw === null || raw === undefined ? null : Number(raw);
                  // 🔴 D7 은 7일 성숙 분모가 소표본 임계 미만이면 숫자를 그리지 않는다.
                  //    임계는 하드코딩하지 않고 정본(MIN_SAMPLE.RATE)을 쓴다 — 스펙 §7.
                  const gatedNote =
                    k.column === "d7_return_pct" && d7Eligible !== null && d7Eligible < MIN_SAMPLE.RATE
                      ? `n=${d7Eligible} · 판단 보류`
                      : null;
                  const v: Verdict = gatedNote ? "unknown" : judge(k, value);
                  const st = VERDICT_STYLE[v];
                  return (
                    <div
                      key={k.column}
                      // 🔴 동적 색은 style 로만 — Tailwind 는 소스에 literal 하게 적힌 클래스만
                      //    정적 스캔하므로 보간하면 CSS 가 아예 생성되지 않는다(Metric.tsx 선례).
                      className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                      style={v === "bad" ? { borderColor: STATUS.critical } : undefined}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-[13px] text-white/70">{k.label}</span>
                        <span className="text-xl font-bold text-white">
                          {gatedNote ? (
                            <span className="text-sm font-normal text-white/40">{gatedNote}</span>
                          ) : value === null ? (
                            // 못 잰 칸은 0 이 아니라 — 다. "쟀더니 0"과 구분된다.
                            <span className="text-white/40">—</span>
                          ) : (
                            formatMetric(value, k.unit)
                          )}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                            st.color === null ? "bg-white/5 text-white/40" : ""
                          }`}
                          style={
                            st.color === null
                              ? undefined
                              : { background: `${st.color}22`, color: st.color }
                          }
                        >
                          {st.label}
                        </span>
                        <span className="text-[11px] text-white/40">
                          기준 {formatMetric(k.baseline, k.unit)}
                          {k.target !== undefined && ` · 목표 ${formatMetric(k.target, k.unit)}`}
                          {k.floor !== undefined && ` · 바닥 ${formatMetric(k.floor, k.unit)}`}
                          {/* 🔴 분산이 큰 비율은 분모를 병기한다 — D7 은 성숙 분모가 코호트보다 작다. */}
                          {k.column === "d7_return_pct" && !gatedNote && d7Eligible !== null &&
                            ` · 성숙 n=${d7Eligible.toLocaleString("ko-KR")}`}
                        </span>
                      </div>
                      {/* note 는 화면에 찍히는 문자열이다 — `**강조**` 를 파싱하는 BlockNote 를 쓴다.
                          plain text 로 그리면 별표가 날것으로 노출된다. */}
                      <BlockNote note={k.rule} />
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
    </div>
  );
}
