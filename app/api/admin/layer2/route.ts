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
          note: `매출 귀속 = 유료별 소모 × 실효 단가(현재 **${formatMetric(wonPerStar, "ratio")}원/별**, 전 기간 결제의 SUM(원)/SUM(별)). 무료별 소비는 매출 0이다. 인챗 업셀(clarifier·extend)은 타로/사주 대화 **안에서** 일어나 원가가 그 chat route 에 이미 잡히므로 타로에 합산된다 — **사주 업셀도 여기 섞인다.** '공통(매출없음)'은 롤링 요약·민감 판정처럼 종목을 가리지 않는 원가라 매출이 없다 — **항상 음수인 게 정상이다.** ⚠️ API 원가는 2026-09-20 부터만 쌓인다 — 창이 그 이전을 포함하면 원가가 0 으로 잡혀 기여가 **과대**로 보인다(아래 표의 호출 수로 확인할 것).`,
        });
      }
    }

    // 🔴 막대와 이 표의 실패 조건이 **다르다**(막대는 RPC 3개 전부, 표는 cost 하나). 설명되는
    //    비대칭이다: 표는 **순수 원가**라 spend·rate 가 죽어도 거짓이 되지 않는다. 오히려 기여를
    //    못 그리는 상황일수록 "원가가 어디로 나갔나"는 봐야 한다. 반대로 막대는 매출−원가라
    //    한 축이 0 으로 들어가면 그 자체가 거짓 숫자가 된다.
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

    // 패키지별 × 신규/재결제 — 1층 '매출의 질' 줄이 합계만 보여주고 여기서 쪼갠다.
    // 🔴 불변식: 이 표의 금액 합 == 같은 창의 admin_layer1_pnl 매출. 두 RPC 의 payments 필터가
    //    글자 단위로 같아서 성립한다(2026-09-27 prod 인라인 대조: 7d 48,600 / 30d 257,800 /
    //    전기간 656,200, 세 창 모두 diff 0). 어긋나면 한 화면 안에서 숫자가 갈린 것이다.
    // 행 수는 STAR_PACKAGES(5종) × 2 로 **닫혀 있다** — route 표와 달리 절단이 필요 없다.
    const mix = await supa.rpc("admin_layer2_revenue_mix", {
      p_since: since,
      p_until: null,
      p_exclude,
    });
    if (mix.error) failed.push("admin_layer2_revenue_mix");
    else {
      // 🔴 BIGINT 는 PostgREST 를 지나며 문자열로 온다 → Number() 필수.
      type MixRow = { package_type: string; is_first: boolean; cnt: string; won: string };
      const rows = (mix.data ?? []) as MixRow[];
      if (rows.length) {
        blocks.push({
          kind: "table",
          title: "패키지별 × 신규/재결제",
          columns: ["패키지", "구분", "건수", "금액"],
          // 🔴 셀은 전부 포맷터를 거친다 — TableBlock.rows 가 (string|null)[][] 인 이유다.
          //    raw number 를 넣으면 천단위 구분자 없는 `196000` 이 되고 같은 화면의 다른 표는
          //    `196,000원` 이 된다.
          rows: rows.map((r) => [
            r.package_type,
            r.is_first ? "신규" : "재결제",
            formatMetric(Number(r.cnt), "count"),
            formatMetric(Number(r.won), "won"),
          ]),
          note: "금액 합은 같은 창의 1층 '매출'과 **정확히 같다**(같은 payments 필터). ⚠️ 탈퇴자의 결제는 user_id 가 NULL 로 익명 보존돼 '첫 결제인가'를 판정할 근거가 없다 — **재결제로 보수 분류**한다(신규로 세면 신규 매출이 실제보다 커진다). prod 실측 해당 건수: 전기간 6건 · 최근 30일 5건.",
        });
      }
    }
    blocks.push({
      kind: "link",
      title: "결제 원장·정산은",
      href: "/admin/payments",
      label: "결제/정산",
    });
    // 🔴 임시 다리 — 1층 '연애 상담' 섹션(활성 패스·패스 구매·스킬 호출)을 Task 8 이 지웠는데
    //    이 드릴다운의 라벨은 아직 '연애 상담'을 약속한다. 빈 약속으로 두지 않는다.
    //    🔴 숫자를 복사하지 않는 이유: /admin/relationship 의 '패스 구매자'는 **사람 수**고
    //    1층이 보여주던 '패스 구매'는 **건수**다 — 정의가 다르다. 여기로 옮기면 이 플랜이
    //    없애려는 바로 그 정의 드리프트가 생긴다.
    //    ⚠️ Task 10 이 이 자리를 실물 블록으로 채울 거라 적어뒀는데, Task 10 의 범위는 패키지
    //       믹스와 구독이었다(위/아래). 연애 패스의 '건수 vs 사람 수' 정의는 **여전히 미정**이고
    //       이 다리도 그대로다 — 다음 담당자가 빈 약속으로 오해하지 않도록 남긴다.
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

  if (sectionRaw === "subscription") {
    // 🔴 이 블록이 답해야 하는 질문 하나 — **5일+ 방문이 0.7% 인 서비스에서 30일 구독이
    //    성립하나**(스펙 §2-5). 그래서 구독 수와 **구독 기간 안의 방문일**을 한 표에서 읽는다.
    //    RPC 가 방문일을 구독 창으로 잘라서 준다(전 기간을 세면 구독 전·만료 후 방문이 섞여
    //    질문에 답하지 못한다 — dev 실측 16.0일 vs 구독 기간 기준 7.0일).
    //
    // 🔴 **3일 체험 전환은 여기 없다.** 1층 드릴다운 라벨이 '체험 전환'을 약속했었는데 지표가
    //    없어 라벨에서 거뒀다(app/admin/page.tsx). 넣지 않은 이유가 분명하다 —
    //    `users.byeolmaru_trial_started_at` 이 **prod 엔 컬럼 자체가 없다**(별마루 미배포).
    //    지금 넣으면 prod 에서 RPC 가 깨진다. → **별마루 prod 배포 후 별도 태스크**다.
    //    (Task 8 의 연애 상담 라벨과 같은 클래스: 화면이 없는 걸 약속하지 않는다. 그때는 링크로
    //     다리를 놨고 여기는 약속을 거뒀다 — 체험은 갈 화면 자체가 아직 없어서다.)
    const sub = await supa.rpc("admin_layer2_subscription", {
      p_since: since,
      p_until: null,
      p_exclude,
    });
    if (sub.error) failed.push("admin_layer2_subscription");
    else {
      // BIGINT·NUMERIC 은 PostgREST 를 지나며 문자열로 온다. avg_visit_days 는 구독자가 0 명이면 null.
      type SubRow = {
        started: string;
        subscribers: string;
        purchasers: string;
        expired: string;
        active_now: string;
        stars_spent: string;
        free_stars: string;
        avg_visit_days: string | null;
        visit_days: string;
        sub_days: string;
      };
      const r = ((sub.data ?? []) as SubRow[])[0];
      const started = Number(r?.started ?? 0);
      // subscribers = **진짜 신규**(그 시점에 활성 구독이 없던 사람). 연장 재구매는 빠진다.
      // purchasers = 창 안에 구독을 **산 사람 전원**(연장 포함) = 방문 지표의 모수.
      // 🔴 둘을 분리한 이유: 연장한 사람이야말로 붙어 있는 구독자라 방문 평균에서 빼면 안 된다.
      //    반대로 '순증'에는 들어가면 안 된다 — 구독자가 늘어난 게 아니라 같은 사람이 이어 산 거다.
      const subscribers = Number(r?.subscribers ?? 0);
      const purchasers = Number(r?.purchasers ?? 0);
      const expired = Number(r?.expired ?? 0);
      const visitDays = Number(r?.visit_days ?? 0);
      const subDays = Number(r?.sub_days ?? 0);
      // 🔴 비율은 pct1 경유 — `visitDays / subDays * 100` 을 먼저 하면 그 double 이 이미 참값이
      //    아니라 포맷터로는 못 고친다(lib/admin/layer1.ts). 구독일이 0 이면 null → 화면에 "—".
      const visitRate = pct1(visitDays, subDays);
      // 평균 방문일은 소수라 `count` 로 찍으면 2.5 일이 "3" 이 되어 의미가 뭉개진다 → ratio.
      const avg = r?.avg_visit_days == null ? null : Number(r.avg_visit_days);
      blocks.push({
        kind: "table",
        title: `구독 (최근 ${days}일)`,
        columns: [
          "구매(건)",
          "신규(명)",
          "만료(명)",
          "순증(명)",
          "현재 활성(명)",
          "소모 별",
          "무료별 몫",
          "구독 중 방문일(평균)",
          "구독일 대비 방문",
        ],
        rows: [
          [
            formatMetric(started, "count"),
            formatMetric(subscribers, "count"),
            formatMetric(expired, "count"),
            // 🔴 순증은 **사람 수끼리** 뺀다. 구매(건)에서 만료(명)를 빼면 연장 재구매가
            //    순증을 부풀린다 — 단위가 다른 뺄셈이다.
            formatMetric(subscribers - expired, "count"),
            formatMetric(Number(r?.active_now ?? 0), "count"),
            formatMetric(Number(r?.stars_spent ?? 0), "count"),
            formatMetric(Number(r?.free_stars ?? 0), "count"),
            avg === null ? null : formatMetric(avg, "ratio"),
            visitRate === null ? null : formatMetric(visitRate, "percent"),
          ],
        ],
        note:
          "🔴 구독 매출은 별 소모다 — **무료별 몫은 현금이 들어온 적이 없어 매출 0**이다(원화 환산은 1층 '구독 매출'이 유료별만 환산한다). " +
          `**구독일 대비 방문 = ${formatMetric(visitDays, "count")}일 방문 / ${formatMetric(subDays, "count")}일 구독**(구독이 살아 있던 KST 달력일 합). ` +
          "평균 방문일만 보면 **오늘 산 구독자가 30일차 구독자와 같은 무게**로 들어가 왜곡된다 — 그래서 경과일을 분모로 깐 이 비율을 같이 읽는다. " +
          `방문 지표의 모수는 창 안에 구독을 **산 사람 전원 ${formatMetric(purchasers, "count")}명**(연장 포함)이다 — 연장한 사람이야말로 붙어 있는 구독자라 빼면 안 된다. 0 명인 창에서는 평균이 '—'다(0 이 아니라 **표본이 없다**). ` +
          "⚠️ '신규'는 구독을 시작한 사람 중 **그 시점에 활성 구독이 없던 사람**만 센다 — 연장 재구매는 빠지고(구독자가 는 게 아니다), **끊겼다 돌아온 사람은 잡힌다**. " +
          "'만료'는 그 사람의 **마지막 구독이 창 안에서 이미 끝난** 경우만 센다(재구독하면 빠진다 · 아직 안 지난 만료는 만료가 아니다). " +
          "1층 '구독자 순증'도 **같은 정의**다 — 같은 창이면 두 화면의 신규·만료·순증은 같은 값이어야 한다. " +
          "⚠️ '구매(건)'이 '신규(명)'보다 크면 그 차이가 **연장 재구매**다(연장은 새 행을 만든다).",
      });
      blocks.push({
        kind: "link",
        title: "별마루 상세는",
        href: "/admin/free/byeolmaru",
        label: "별마루",
      });
    }
  }

  if (sectionRaw === "signups") {
    // 1층 '가입' 을 펼친 자리 — **어디서 온 가입인가** 와 **무료 상품이 사람을 데려오나**.
    //
    // 🔴 무료 상품의 코호트를 utm 쿠키로 잡지 않는다. `byeolkong_acq` 는 first-touch 라 30일간
    //    덮어쓰지 않아, 광고로 먼저 왔던 사람이 공유 링크로 재방문해 가입하면 utm_source='meta'
    //    로 기록되고 공유 기여가 통째로 은폐된다(스펙 §5-3). RPC 가 **착지 anon → 로그인**
    //    브리지로 잡는 이유다(MBTI 가 이미 쓰는 기법).
    //
    // 🔴 BRIDGE_DAYS 의 단일 원천은 여기다 — RPC 인자와 아래 note 문자열이 **같은 상수**를 본다.
    //    SQL 에 상수로 박고 note 에 숫자를 손으로 적으면 두 곳이 되어 조용히 갈린다.
    //    30일인 근거는 마이그레이션 주석 참조(acq 쿠키 수명과 같은 지평).
    const BRIDGE_DAYS = 30;
    const FREE_PRODUCTS = [
      { utm: "byeoljari", label: "별 인연 별자리" },
      { utm: "saju_mbti", label: "사주 MBTI" },
      { utm: "byeolmaru_tarot", label: "별마루 오늘의 타로" },
      { utm: "byeolmaru_saju", label: "별마루 오늘의 사주" },
    ];
    // 🔴 반환 모양이 다른 두 RPC 를 **한 배열에 spread 로 섞지 않는다** — 튜플이 유니온으로
    //    무너져 이후 분기에서 .data 의 모양을 잃는다. 퍼널만 안쪽 Promise.all 로 묶는다.
    const [mix, funnels] = await Promise.all([
      supa.rpc("admin_layer2_signup_mix", { p_since: since, p_until: null, p_exclude }),
      Promise.all(
        FREE_PRODUCTS.map((p) =>
          supa.rpc("admin_free_share_funnel", {
            p_product: p.utm,
            p_since: since,
            p_until: null,
            p_exclude,
            p_bridge_days: BRIDGE_DAYS,
          })
        )
      ),
    ]);

    if (mix.error) failed.push("admin_layer2_signup_mix");
    else {
      // 🔴 BIGINT 는 PostgREST 를 지나며 문자열로 온다 → Number() 필수.
      type MixRow = { source: string; signups: string; payers: string; revenue_won: string };
      const rows = (mix.data ?? []) as MixRow[];
      if (rows.length) {
        blocks.push({
          kind: "table",
          title: `유입 경로별 가입 · 결제 (최근 ${days}일)`,
          // 헤더에 '(원)' 을 안 붙인다 — formatMetric(…, "won") 이 값에 '원' 을 붙이므로
          // 같이 쓰면 `매출(원): 12,000원` 이 된다.
          columns: ["경로", "가입", "결제자", "매출", "가입당"],
          // 🔴 셀은 전부 포맷터를 거친다 — TableBlock.rows 가 (string|null)[][] 인 이유다.
          //    raw number 를 넣으면 천단위 구분자 없는 `187800` 이 되고 같은 화면의 다른 표는
          //    `187,800원` 이 된다.
          rows: rows.map((r) => {
            const n = Number(r.signups);
            const won = Number(r.revenue_won);
            return [
              r.source,
              formatMetric(n, "count"),
              formatMetric(Number(r.payers), "count"),
              formatMetric(won, "won"),
              // 가입당은 퍼센트가 아니라 나눗셈이라 pct1 대상이 아니다. 분모 0 이면 "—".
              n > 0 ? formatMetric(won / n, "won") : null,
            ];
          }),
          // 🔴 note 에 **그날 잰 값**을 박지 않는다 — 화면에 렌더되는 문자열이라 시간이 지나면
          //    낡고, 낡은 주장은 옆의 진짜 경고까지 같이 깎는다(이 워크스트림에서 반복된 사고).
          //    숫자 대신 **관계**를 말한다. 검증 수치는 커밋 메시지와 마이그레이션 주석에 있다.
          note: "오가닉은 user_acquisition 행이 **없는** 가입이다 — 쿠키 차단·acq 쿠키 30일 만료도 섞이므로 오가닉의 **상한**으로 읽을 것. 🔴 이 표의 가입 합은 같은 창의 1층 '가입'(admin_layer1_flow)과 **항상 같아야 한다** — 같은 users 를 같은 창·같은 필터로 세기 때문이다. 어긋나면 1층과 2층이 다른 모수를 말하는 것이다. ⚠️ 결제·매출은 **창 안의 결제가 아니라 그 코호트의 누적**이다 — 코호트가 가입일로 정의되므로 결제는 전부 가입 이후이고, 최근 가입일수록 아직 덜 익었다.",
        });
      }
    }

    // 🔴 퍼널 표는 mix 의 성패와 무관하게 항상 그린다(설명되는 비대칭) — 서로 다른 RPC 이고,
    //    유입 경로가 안 보인다고 무료 상품의 획득 기여까지 가릴 이유가 없다.
    const funnelRows = FREE_PRODUCTS.map((p, i) => {
      const res = funnels[i];
      if (res.error) {
        failed.push(`admin_free_share_funnel(${p.utm})`);
        // null 은 화면에서 "—" — 0 으로 채우면 "착지가 없었다" 는 **거짓말**이 된다.
        return [p.label, null, null, null, null];
      }
      const r = ((res.data ?? []) as Record<string, string>[])[0];
      return [
        p.label,
        formatMetric(Number(r?.landings ?? 0), "count"),
        formatMetric(Number(r?.signups ?? 0), "count"),
        formatMetric(Number(r?.payers ?? 0), "count"),
        formatMetric(Number(r?.revenue_won ?? 0), "won"),
      ];
    });
    blocks.push({
      kind: "table",
      title: `무료 상품 공유 퍼널 — 착지 → 가입 → 결제 (최근 ${days}일)`,
      columns: ["상품", "착지", "가입", "결제자", "매출"],
      rows: funnelRows,
      note:
        "🔴 무료 상품을 '전환율'로 재지 않는다 — 2026-08-24 실측에서 무료→결제는 깔때기가 아니라 역인과였다. 이 표는 **획득(바이럴)** 을 잰다. " +
        `코호트는 utm 쿠키가 아니라 **착지 anon → 로그인** 브리지로 잡고(first-touch 은폐 회피), **착지 후 ${BRIDGE_DAYS}일 안의 로그인만** 귀속한다(상한이 없으면 1년 전 착지가 오늘 가입으로 잡혀 인과가 희석된다 — anon 쿠키 수명이 1년이다). ` +
        "'가입'은 **착지 이후에 새로 생긴 계정**만 센다 — 이미 있던 계정이 공유 링크로 들어와 로그인한 건 획득이 아니다(2026-09-27 prod 반사실: 이 가드가 −4.2%). 결제도 착지 이후 것만 센다. " +
        "⚠️ **비대칭 주의** — 분모(착지)는 anon 기준이라 어드민·테스트 계정을 뺄 수 없고(비로그인 착지 행엔 user_id 가 없다), 분자(가입·결제)에는 제외가 걸린다. 그만큼 전환이 실제보다 **낮게** 보인다. " +
        "⚠️ 별마루 2종은 공유 링크에 utm 이 붙어 있다(DailyCardBlock · SajuTodayView) — **그 코드가 배포된 환경에서만** 값이 쌓인다. 별마루가 없는 환경에서 0인 건 배선 문제가 아니라 구조적으로 당연한 값이다.",
    });
    blocks.push({ kind: "link", title: "소재별 지출은", href: "/admin/ads", label: "광고 지출" });
  }

  if (sectionRaw === "readings") {
    // 🔴 불변식: SUM(cnt) == 1층 흐름의 `리딩`(admin_layer1_flow.readings). 두 RPC 의 readings
    //    필터가 글자 단위로 같아서 성립한다 — 1층 기본 창도 daysAgoKstIso(6) 이라 days=7 이면
    //    같은 창이다. 2026-09-27 prod 대조: 246 == 246(7일) · 956 == 956(30일, 3명 제외).
    const rd = await supa.rpc("admin_layer2_readings", { p_since: since, p_until: null, p_exclude });
    if (rd.error) failed.push("admin_layer2_readings");
    else {
      // 🔴 BIGINT·NUMERIC 은 PostgREST 를 지나며 **문자열**로 온다 — Number() 없이 쓰면 비교도
      //    산술도 조용히 틀린다.
      type RdRow = {
        consultation_type: string;
        cnt: string;
        paid_cnt: string;
        ended_cnt: string;
        viewed_cnt: string;
        avg_user_turns: string | null;
      };
      blocks.push({
        kind: "table",
        title: `종목별 리딩 (최근 ${days}일)`,
        // 헤더에 `(%)` 를 붙이지 않는다 — formatMetric(_, "percent") 이 이미 `%` 를 붙여
        // `완료율(%): 59.0%` 가 된다(같은 이유로 매출 표의 `(원)` 도 뺐다).
        columns: ["종목", "리딩", "유료", "완료율", "결과 열람", "평균 유저 턴"],
        rows: ((rd.data ?? []) as RdRow[]).map((r) => {
          const n = Number(r.cnt);
          // 🔴 퍼센트는 반드시 pct1 경유 — `(a/b)*1000` 으로 먼저 나누면 배정도 오차가 참값을
          //    이미 놓쳐서(201/400 → 502.4999…) 뒤에서 어떤 반올림을 해도 50.3 이 안 나온다.
          //    분모 400의 배수 계열에서 체계적으로 갈리고, 리딩 건수는 쉽게 수백~수천이다.
          const ended = pct1(Number(r.ended_cnt), n);
          const viewed = pct1(Number(r.viewed_cnt), n);
          return [
            r.consultation_type,
            formatMetric(n, "count"),
            formatMetric(Number(r.paid_cnt), "count"),
            // null 은 "—" 로 둔다 — 0 으로 뭉개면 "완료가 0%" 와 "표본이 없다" 가 같은 칸이 된다.
            ended === null ? null : formatMetric(ended, "percent"),
            viewed === null ? null : formatMetric(viewed, "percent"),
            // 🔴 `count` 가 아니라 `ratio` — count 로 찍으면 2.21턴이 "2" 가 되어 소수가 증발한다.
            r.avg_user_turns === null ? null : formatMetric(Number(r.avg_user_turns), "ratio"),
          ];
        }),
        // 🔴 note 에 **그날 잰 값**을 박지 않는다(같은 파일 signups 주석과 같은 규율) — 화면에
        //    렌더되는 문자열이라 낡고, 낡은 주장은 옆의 진짜 경고까지 같이 깎는다. 숫자 대신
        //    **관계**를 말한다. 검증 수치는 커밋 메시지와 마이그레이션 주석에 있다.
        note:
          "완료 = 별콩이 발화에 **[END] 마커**가 있다(messages.content 기준 — turn_close 컬럼이 아니다. 3층 roadmap KPI 와 같은 정의다). " +
          "평균 유저 턴은 **리딩당** 평균이다 — 메시지가 한 건도 없는 리딩도 **0턴으로 분모에 넣는다.** 빼면 '한 마디도 못 하고 죽은 리딩'이 평균에서 통째로 사라져 평균이 **과대**해진다(메시지 0건 리딩이 많은 relationship 에서 특히 크다). " +
          "결과 열람은 여기선 **리딩 기준**이다 — 1층 가드레일의 결과 열람은 **코호트 기준**이라 값이 다르다(둘 다 정본이고 분모가 다르다). " +
          "🔴 saju·tarot 행에는 **/fortune one-shot 리포트가 섞여 있다** — 리포트도 readings 에 consultation_type 'saju'|'tarot' 로 저장되는데(app/api/fortune/create), 대화가 없어 [END] 가 **구조적으로** 안 찍힌다. 그만큼 이 표의 완료율은 **대화 완료율보다 낮다.** saju 는 리포트가 대부분이라 격차가 크고(실제 대화 완료율의 1/6 수준), tarot 은 리포트 비중이 미미해 거의 영향이 없다 — 종목별 완료율을 '대화 품질'로 읽으려면 이 혼입을 먼저 걷어내야 한다. " +
          "2026-09-12 실측: 종료 원인은 마무리 버튼 59% · 자발 13% · 무언 이탈 27%.",
      });
      blocks.push({ kind: "link", title: "개별 리딩은", href: "/admin/readings", label: "리딩/상담" });
    }
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
