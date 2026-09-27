// app/api/admin/layer2/route.ts — 2층 드릴다운 데이터.
//
// 섹션 하나당 한 번 호출된다(Drilldown 이 펼칠 때만). 집계는 전부 RPC 가 하고 이 라우트는
// 블록으로 옮기기만 한다 — 원본 행을 앱으로 끌어오지 않는다(AGENTS.md).
//
// 🔴 가드는 이중이다 — proxy.ts 가 /api/admin/* 를 1차로 막고, 여기 requireAdmin() 이 2차로 막는다.
//    둘 다 있어야 한다(AGENTS.md "데이터는 /api/admin/* 개별 requireAdmin 으로 이중 보호").
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionArray, adminExclusionList } from "@/lib/admin";
import { daysAgoKstIso, startOfTodayKstIso } from "@/lib/admin-time";
import { formatMetric } from "@/lib/admin/format";
import { pct1 } from "@/lib/admin/layer1";
import { labelOfRoute, labelOfSpendSource, PRODUCT_LABELS, type ProductLabel } from "@/lib/admin/product-map";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";
import { isLayer2Section, type Layer2Block, type Layer2Response } from "@/lib/admin/layer2-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const sectionRaw = req.nextUrl.searchParams.get("section") ?? "";
  if (!isLayer2Section(sectionRaw)) {
    return NextResponse.json({ error: "bad_section" }, { status: 400 });
  }
  // 🔴 NaN 가드 — Math.min/max 는 NaN 을 그대로 통과시키고, daysAgoKstIso(NaN) 은 Invalid Date 를
  //    만들어 .toISOString() 에서 RangeError 로 터진다(`?days=abc` → 500). 파싱 실패는 400 으로
  //    돌려준다 — 조용히 7 로 떨어뜨리면 호출부 버그가 안 드러난다(bad_section 과 같은 처리).
  const daysRaw = Number(req.nextUrl.searchParams.get("days") ?? 7);
  if (!Number.isFinite(daysRaw)) {
    return NextResponse.json({ error: "bad_days" }, { status: 400 });
  }
  //    Math.floor 는 표기용 — `?days=7.5` 를 막지 않으면 표 제목이 `최근 7.5일` 로 찍힌다.
  //    창 경계를 말하는 라벨이 이상하면 이 화면의 존재 이유(믿을 수 있는 숫자)가 깎인다.
  const days = Math.min(365, Math.max(1, Math.floor(daysRaw)));
  const since = daysAgoKstIso(days - 1);

  const supa = getServiceSupabase();
  const p_exclude = adminExclusionArray();
  const blocks: Layer2Block[] = [];
  const failed: string[] = [];

  if (sectionRaw === "contribution") {
    // 2층의 핵심 — 어느 상품이 돈을 벌고 어느 상품이 태우나.
    // 매출은 **유료별 소모 × 실효 단가**로, 원가는 `llm_usage.route` 로 귀속한다.
    //
    // 🔴 매출 귀속은 `admin_star_spend_breakdown` 의 domain 이 **아니다.** 그 사다리는 매칭
    //    안 된 source 를 전부 `ELSE 'upsell'` 로 떨어뜨리고, 플랜 원안은 그걸 타로로 접었다.
    //    2026-09-27 dev 실측 — 그 폴백에 있던 건 업셀이 아니라 relationship_slot(1,800별) ·
    //    relationship_sim(75) · relationship_sim_suggest(10) · byeolmaru_subscription(20) 이다.
    //    → 전용 RPC 로 source 를 받아 `labelOfSpendSource` 가 라벨링한다(유닛으로 잠김).
    const [spend, cost, rate] = await Promise.all([
      supa.rpc("admin_layer2_spend_by_source", { p_since: since, p_until: null, p_exclude }),
      supa.rpc("admin_layer2_cost_by_route", { p_since: since, p_until: null, p_exclude }),
      supa.rpc("admin_star_won_rate", { p_exclude }),
    ]);
    if (spend.error) failed.push("admin_layer2_spend_by_source");
    if (cost.error) failed.push("admin_layer2_cost_by_route");
    if (rate.error) failed.push("admin_star_won_rate");

    // 🔴 기여 막대는 **셋 다** 성공해야 그린다. 하나라도 죽으면 그 축이 0 으로 들어가
    //    "매출 없는 상품" 또는 "원가 없는 상품" 이라는 **거짓말**이 된다(빈 화면보다 나쁘다).
    //    failed 배너만으로는 그 거짓을 못 막는다 — 숫자가 이미 그럴듯하게 그려져 있다.
    if (!spend.error && !cost.error && !rate.error) {
      // 🔴 NUMERIC 은 PostgREST 를 지나며 문자열로 온다 — Number() 없이 더하면 문자열 연결이 된다.
      const wonPerStar = Number(rate.data ?? 0);
      const margin = new Map<ProductLabel, { rev: number; cost: number }>();
      const bump = (k: ProductLabel, rev: number, c: number) => {
        const cur = margin.get(k) ?? { rev: 0, cost: 0 };
        margin.set(k, { rev: cur.rev + rev, cost: cur.cost + c });
      };

      type SpendRow = { source: string; stars: string; free_stars: string };
      for (const r of (spend.data ?? []) as SpendRow[]) {
        // 유료별만 매출이다 — 무료별(웰컴 보너스 등)로 산 소비는 현금이 들어온 적이 없다.
        const paidStars = Number(r.stars) - Number(r.free_stars);
        bump(labelOfSpendSource(r.source), paidStars * wonPerStar, 0);
      }
      type CostRow = { route: string; cost_won: string };
      for (const r of (cost.data ?? []) as CostRow[]) {
        bump(labelOfRoute(r.route), 0, Number(r.cost_won));
      }

      const items = PRODUCT_LABELS.flatMap((label) => {
        const m = margin.get(label) ?? { rev: 0, cost: 0 };
        // 🔴 `value !== 0` 으로 거르면 안 된다 — 매출과 원가가 **정확히 같은** 상품(기여 0)이
        //    목록에서 사라진다. "기여가 0 이다" 와 "그 상품이 없다" 는 다른 말이다.
        if (m.rev === 0 && m.cost === 0) return [];
        return [{ label, value: m.rev - m.cost }];
      });

      // 매출도 원가도 0 이면 빈 차트를 그리지 않는다 — 블록이 하나도 안 쌓이면 Drilldown 이
      // "표시할 데이터가 없다"를 그린다(제목만 있는 빈 막대보다 정확한 말이다).
      if (items.length) {
        blocks.push({
          kind: "bars",
          title: "상품별 기여마진 (매출 귀속 − API 원가 귀속)",
          unit: "won",
          items,
          // 🔴 단가는 `won` 이 아니라 `ratio` 로 찍는다 — won 은 정수 반올림이라 90.64 가 "91원"
          //    이 되고, 단가가 1.6% 틀린 채로 "이 숫자가 정본" 이라 말하게 된다.
          note: `매출 귀속 = 유료별 소모 × 실효 단가(현재 **${formatMetric(wonPerStar, "ratio")}원/별**, 전 기간 결제의 SUM(원)/SUM(별)). 무료별 소비는 매출 0이다. 인챗 업셀(clarifier·extend)은 타로/사주 대화 **안에서** 일어나 원가가 그 chat route 에 이미 잡히므로 타로에 합산된다 — **사주 업셀도 여기 섞인다.** '공통'은 롤링 요약·민감 판정처럼 종목을 가리지 않는 원가라 매출이 없다 — **항상 음수인 게 정상이다.** ⚠️ API 원가는 2026-09-20 부터만 쌓인다 — 창이 그 이전을 포함하면 원가가 0 으로 잡혀 기여가 **과대**로 보인다(아래 표의 호출 수로 확인할 것).`,
        });
      }
    }

    if (!cost.error) {
      const all = (cost.data ?? []) as {
        route: string;
        cost_won: string;
        calls: string;
        free_user_cost_won: string;
      }[];
      const LIMIT = 12;
      const rows = all
        .slice(0, LIMIT)
        // 🔴 셀은 전부 포맷터를 거친다 — raw number 를 넣으면 천단위 구분자 없는 `173420` 이
        //    되고 같은 화면의 다른 표는 `173,420` 이 된다(TableBlock.rows 가 string 인 이유).
        .map((r) => [
          r.route,
          formatMetric(Number(r.cost_won), "won"),
          formatMetric(Number(r.calls), "count"),
          formatMetric(Number(r.free_user_cost_won), "won"),
        ]);
      // 🔴 절단은 **눈에 보여야** 한다(AGENTS.md) — 플래그만 두고 안 보여주면 의미가 없다.
      const omitted = all.length - rows.length;
      if (rows.length) {
        blocks.push({
          kind: "table",
          title: "route 별 API 원가",
          columns: ["route", "원가", "호출", "미결제자 몫"],
          rows,
          note: `원가 큰 순 ${rows.length}개${omitted > 0 ? ` — **${omitted}개 생략**(총 ${all.length}개 route)` : ""}. 미결제자 몫 = 그 호출 시점에 완료 결제 이력이 없던 사람에게 태운 원가. 2026-08-10 실측에서 무료별 87%가 미결제자에게 갔다. ⚠️ user_id 가 없는 행(탈퇴·배치 호출)도 미결제자로 세므로 실제보다 소폭 높다.`,
        });
      }
    }
  }

  if (sectionRaw === "revenue") {
    // 별 소모 5종 — 1층에서 내려온 것(스펙 §3). /admin/analytics 와 **같은 RPC** 를 창만 맞춰 쓴다.
    // 유효 운세 타입은 앱이 단일 원천 — 하드코딩하면 FORTUNE_CONFIG 추가 시 조용히 드리프트한다.
    //
    // 🔴 별 소모의 **오늘/어제 Δ 는 1층에서 내려오며 의도적으로 버렸다**(2026-09-27 사용자 결정) —
    //    2층은 7일 합계 창이다. 누락이 아니라 선택이다. /admin/analytics 도 30일 고정이라
    //    별 소모의 **일일 맥박을 보는 화면은 현재 없다.** 필요해지면 그때 창을 새로 판다.
    const spend = await supa.rpc("admin_star_spend_breakdown", {
      p_since: since,
      p_until: null,
      p_exclude,
      p_fortune_types: Object.keys(FORTUNE_CONFIG),
    });
    if (spend.error) failed.push("admin_star_spend_breakdown");
    else {
      // RPC 는 (domain, product, cnt, stars, free_stars, users) 를 준다 — 여기서 쓰는 4개만 선언한다.
      // 🔴 BIGINT 는 PostgREST 를 지나며 문자열로 온다 → Number() 필수(빼면 문자열 연결로 조용히 틀린다).
      type SpendRow = { domain: string; product: string; stars: string; free_stars: string };
      const rows = (spend.data ?? []) as SpendRow[];
      const isRelSkill = (r: SpendRow) => r.domain === "relationship" && r.product.startsWith("스킬:");
      // 🔴 무료별은 **종목별**로 쪼개야 한다 — 1층 카드가 종목마다 `(무료 N)` 을 보여줬고,
      //    무료 비중은 종목마다 다르다(웰컴 20별이 타로에 몰린다). 총량만으로는 안 보인다.
      const parts = (
        [
          ["타로 대화", (r: SpendRow) => r.domain === "tarot"],
          ["운세 리포트", (r: SpendRow) => r.domain === "fortune"],
          ["인챗 업셀", (r: SpendRow) => r.domain === "upsell"],
          ["연애 상담", (r: SpendRow) => r.domain === "relationship" && !isRelSkill(r)],
          ["연애 스킬", isRelSkill],
        ] as [string, (r: SpendRow) => boolean][]
      ).map(([label, pred]) => {
        const hit = rows.filter(pred);
        return {
          label,
          stars: hit.reduce((s, r) => s + Number(r.stars), 0),
          free: hit.reduce((s, r) => s + Number(r.free_stars), 0),
        };
      });
      blocks.push({
        kind: "bars",
        title: "별 소모 5종",
        unit: "count",
        items: parts.map((p) => ({ label: p.label, value: p.stars })),
        note: "별 소모는 매출이 아니다 — 무료별(웰컴·보너스)이 섞여 있다. 얼마나 섞였는지는 바로 아래 표, 원화 기여는 '기여 ▾'에서 본다.",
      });
      blocks.push({
        kind: "table",
        title: "무료별 비중",
        columns: ["종목", "총 별", "무료별", "무료 비중"],
        // 🔴 비중은 pct1 경유 — `free / stars * 100` 을 먼저 하면 그 double 이 이미 참값이 아니라
        //    포맷터로는 못 고친다(lib/admin/layer1.ts). 종목 소모가 0 이면 null → 화면에 "—".
        rows: parts.map((p) => {
          const share = pct1(p.free, p.stars);
          return [
            p.label,
            formatMetric(p.stars, "count"),
            formatMetric(p.free, "count"),
            share === null ? null : formatMetric(share, "percent"),
          ];
        }),
        note: "무료 비중이 높은 종목일수록 그 별 소모는 매출에서 멀다. 🔴 이 표가 **서비스 전체 기준으로** 무료별을 보는 유일한 자리다 — /admin/analytics 는 free_stars 를 아예 렌더하지 않고, /admin/free/* 는 그 무료상품 신규 코호트만 본다. 지우면 서비스 전체의 무료별이 다시 안 보인다.",
      });
      // 이 링크는 **spend 데이터에 대한 것**이라 else 안이다 — RPC 가 죽으면 "상품별 상세"가
      // 가리킬 대상 자체가 없다.
      blocks.push({
        kind: "link",
        title: "상품별·코호트별 상세는",
        href: "/admin/analytics",
        label: "애널리틱스",
      });
    }
    // 🔴 임시 다리 — 1층 '연애 상담' 섹션(활성 패스·패스 구매·스킬 호출)을 Task 8 이 지웠는데
    //    이 드릴다운의 라벨은 아직 '연애 상담'을 약속한다. 빈 약속으로 두지 않는다.
    //    🔴 숫자를 복사하지 않는 이유: /admin/relationship 의 '패스 구매자'는 **사람 수**고
    //    1층이 보여주던 '패스 구매'는 **건수**다 — 정의가 다르다. 여기로 옮기면 이 플랜이
    //    없애려는 바로 그 정의 드리프트가 생긴다. 정의를 정하고 실물 블록으로 이 자리를
    //    채우는 건 Task 10(매출 ▾ 보강)이다.
    // 🔴 위 애널리틱스 링크와 달리 **else 밖**이다(설명되는 비대칭): 이건 spend 데이터가 아니라
    //    삭제된 화면 요소를 잇는 **이동 다리**라 admin_star_spend_breakdown 의 성패와 무관하다.
    //    별 소모 조회가 죽었다고 연애 상담으로 가는 길까지 막을 이유가 없다 — 오히려 그때가
    //    다른 화면으로 건너가야 할 때다.
    blocks.push({
      kind: "link",
      title: "활성 패스 · 패스 구매 · 스킬 호출은",
      href: "/admin/relationship",
      label: "연애 상담 화면",
    });
  }

  if (sectionRaw === "withdrawal") {
    // 1층의 탈퇴 표시 둘(오늘 섹션의 오늘/어제 · 전체 섹션의 누적+가입대비)이 여기로 내려왔다.
    // 🔴 창 경계는 lib/admin-time.ts 가 단일 원천이다 — 라우트에서 날짜 산술을 새로 쓰지 않는다.
    const todayIso = startOfTodayKstIso();
    const yesterdayIso = daysAgoKstIso(1);
    // account_withdrawals 는 시각 컬럼이 withdrawn_at 이다(created_at 아님).
    const wCount = (s?: string, u?: string) => {
      let q = supa.from("account_withdrawals").select("id", { count: "exact", head: true });
      if (s) q = q.gte("withdrawn_at", s);
      if (u) q = q.lt("withdrawn_at", u);
      return q;
    };
    const excl = adminExclusionList(); // PostgREST in-리스트 문자열 (빈 목록이면 null)
    let usersQ = supa.from("users").select("id", { count: "exact", head: true });
    if (excl) usersQ = usersQ.not("id", "in", excl);

    const [wToday, wYesterday, wWindow, wAll, uAll] = await Promise.all([
      wCount(todayIso),
      wCount(yesterdayIso, todayIso),
      wCount(since),
      wCount(),
      usersQ,
    ]);
    const wFailed = [wToday, wYesterday, wWindow, wAll].some((r) => r.error);
    if (wFailed) failed.push("account_withdrawals");
    if (uAll.error) failed.push("users");

    if (!wFailed) {
      blocks.push({
        kind: "table",
        title: "탈퇴 수",
        columns: ["창", "탈퇴"],
        rows: [
          ["오늘", formatMetric(wToday.count ?? 0, "count")],
          ["어제", formatMetric(wYesterday.count ?? 0, "count")],
          [`최근 ${days}일`, formatMetric(wWindow.count ?? 0, "count")],
          ["누적", formatMetric(wAll.count ?? 0, "count")],
        ],
        note: "창은 전부 KST 자정 기준. 🔴 어드민·테스트 계정을 분자에서 뺄 수 없다 — account_withdrawals 는 kakao_id_hash 만 남기고 user_id 를 안 남긴다(탈퇴 = 유저 삭제). 실제보다 소폭 높게 나온다. ⚠️ 탈퇴는 users DELETE CASCADE 라 그 유저의 결제·리딩·유입기록이 함께 사라진다 — 1층 '전체' 의 누적 가입·리딩·매출이 어제보다 작아지는 건 버그가 아니라 이 숫자만큼의 소실이다.",
      });
    }

    if (!wFailed && !uAll.error) {
      // 탈퇴율 = 탈퇴 / (현재 유저 + 탈퇴). 탈퇴는 users 를 지우므로 "총 가입 이력" 을 이렇게 복원한다.
      // 🔴 비율 계산은 pct1 경유다 — `num / den * 100` 을 먼저 하면 그 double 이 이미 참값이
      //    아니라(23/80*100 = 28.749999999999996) 뒤에서 어떤 반올림을 해도 28.8 이 안 나온다.
      //    포맷터로 고칠 수 있는 문제가 아니고 나눗셈 자리에서 고쳐야 한다(lib/admin/layer1.ts).
      const wAllN = wAll.count ?? 0;
      const usersN = uAll.count ?? 0;
      const rate = pct1(wAllN, usersN + wAllN); // den=0 이면 null
      blocks.push({
        kind: "table",
        title: "누적 탈퇴율",
        columns: ["탈퇴(누적)", "현재 유저", "가입대비"],
        rows: [
          [
            formatMetric(wAllN, "count"),
            formatMetric(usersN, "count"),
            rate === null ? null : formatMetric(rate, "percent"),
          ],
        ],
        note: "탈퇴율 = 탈퇴 / (현재 유저 + 탈퇴). 탈퇴는 users 를 지우므로 '총 가입 이력' 을 이렇게 복원한다. ⚠️ 근사: 분모(현재 유저)에는 어드민 제외가 걸리는데 분자(탈퇴)에는 못 건다 — account_withdrawals 에 user_id 가 없어 판별 자체가 불가능하다. 이 비대칭 때문에 실제보다 소폭 높게 나온다.",
      });
    }

    blocks.push({ kind: "link", title: "이탈 사유는", href: "/admin/survey", label: "이탈 설문" });
  }

  // 나머지 섹션은 Task 9~14 에서 채운다. 빈 배열이면 Drilldown 이 "표시할 데이터가 없다"를 그린다.
  // 🔴 `d7` 섹션은 `days` 를 그대로 코호트 창으로 쓰면 안 된다 — 7일 코호트에 7일 성숙을 요구하면
  //    분모가 빈다(Task 7 실측: 7일 창 0명 / 30일 창 640명). 리텐션은 자체 코호트 창을 가져야 한다.
  const body: Layer2Response = { section: sectionRaw, blocks, ...(failed.length ? { failed } : {}) };
  return NextResponse.json(body);
}
