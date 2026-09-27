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
import { daysAgoKstIso, kstDate, startOfTodayKstIso } from "@/lib/admin-time";
import { formatMetric } from "@/lib/admin/format";
import { pct1 } from "@/lib/admin/layer1";
import { labelOfRoute, labelOfSpendSource, PRODUCT_LABELS, type ProductLabel } from "@/lib/admin/product-map";
import { readingRowView } from "@/lib/admin/reading-rows";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";
import { MIN_SAMPLE } from "@/lib/admin-metrics";
import {
  isLayer2Section,
  type Layer2Block,
  type Layer2Response,
  type Layer2Section,
} from "@/lib/admin/layer2-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 섹션 핸들러가 공유하는 전부 — 이 6개 말고는 섹션끼리 런타임 결합이 없다(리뷰 실측).
 * 그래서 컨텍스트 하나를 넘기면 되고, 섹션을 파일로 쪼갤 필요도 아직 없다.
 */
interface Layer2Ctx {
  supa: ReturnType<typeof getServiceSupabase>;
  /** 창 시작(KST 자정 경계). */
  since: string;
  /** 창 길이 — 표 제목·note 의 "최근 N일" 이 쓴다. */
  days: number;
  p_exclude: string[];
  /** 핸들러가 밀어 넣는다. 비어 있으면 Drilldown 이 "표시할 데이터가 없다"를 그린다. */
  blocks: Layer2Block[];
  /** 실패한 조회 이름 — 빈 결과를 "데이터 없음"으로 위장하지 않기 위한 배너용. */
  failed: string[];
}

type Layer2Handler = (ctx: Layer2Ctx) => Promise<void>;

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

  await LAYER2_HANDLERS[sectionRaw]({ supa, since, days, p_exclude, blocks, failed });

  const body: Layer2Response = { section: sectionRaw, blocks, ...(failed.length ? { failed } : {}) };
  return NextResponse.json(body);
}

/**
 * 🔴 섹션 → 핸들러 **전수 매핑**. 이전의 `if (sectionRaw === …)` 체인은 LAYER2_SECTIONS 와
 *    컴파일 타임 연결이 없어서, 9번째 키를 추가하고 여기를 잊으면 **tsc 가 침묵하고** 화면은
 *    "표시할 데이터가 없다"를 그렸다 — 이 리포가 반복해서 물린 "조용히 실패" 클래스다.
 *    Record<Layer2Section, …> 는 키가 하나라도 빠지면 컴파일을 깬다. 섹션을 추가할 때
 *    lib/admin/layer2-types.ts 의 LAYER2_SECTIONS 만 고치면 tsc 가 여기로 데려온다.
 *
 * GET 아래에 두는 이유: 진입점이 파일 위에 있어야 읽힌다. const 는 모듈 로드 시점에 초기화되고
 * GET 은 요청 시점에야 돌므로 TDZ 문제가 없다.
 */
const LAYER2_HANDLERS: Record<Layer2Section, Layer2Handler> = {
  contribution: async ({ supa, since, p_exclude, blocks, failed }) => {
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
  },
  revenue: async ({ supa, since, p_exclude, blocks, failed }) => {
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
  },
  subscription: async ({ supa, since, days, p_exclude, blocks, failed }) => {
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
  },
  signups: async ({ supa, since, days, p_exclude, blocks, failed }) => {
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
    // 퍼널 4개를 안쪽 Promise.all 로 한 번 더 묶는다 — 성격이 다른 두 결과 묶음(유입 믹스 /
    // 상품별 퍼널)에 각각 이름이 붙어 아래 분기가 읽힌다. 플랫하게 spread 하면 `funnels[i]` 가
    // 인덱스 산술이 된다.
    //   ⚠️ 이게 **타입 때문**은 아니다. lib/supabase.ts 가 createClient 를 Database 제네릭 없이
    //      부르므로 모든 .rpc() 가 any 기반이고(그래서 아래가 `as MixRow[]` 로 손캐스팅한다),
    //      플랫 형태도 tsc 를 통과한다 — 2026-09-27 프로젝트 tsconfig 로 실측. 가독성 선택이다.
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
        "'가입'은 **착지 이후에 새로 생긴 계정**만 센다 — 이미 있던 계정이 공유 링크로 들어와 로그인한 건 획득이 아니다(2026-09-27 prod 반사실: 이 가드가 −4.2%). 결제에도 같은 조건이 걸려 있지만 그건 중복 방어다 — 가입 가드가 이미 사실상 보장한다. " +
        "⚠️ **착지에만 어드민·테스트 제외가 안 걸린다** — 비로그인 착지 행엔 user_id 가 없어 판별 자체가 불가능하다(가입·결제엔 걸린다). 착지 수가 그만큼 **과대**다. " +
        "⚠️ 결제는 **최근 착지일수록 덜 익었다**(위 표와 같은 이유). 착지→가입은 대부분 착지 당일에 끝나 가입 쪽은 거의 안 밀린다. " +
        "⚠️ 별마루 2종은 공유 링크에 utm 이 붙어 있다(DailyCardBlock · SajuTodayView) — **그 코드가 배포된 환경에서만** 값이 쌓인다. 별마루가 없는 환경에서 0인 건 배선 문제가 아니라 구조적으로 당연한 값이다.",
    });
    blocks.push({ kind: "link", title: "소재별 지출은", href: "/admin/ads", label: "광고 지출" });
  },
  readings: async ({ supa, since, days, p_exclude, blocks, failed }) => {
    // 🔴 불변식: SUM(cnt) == 1층 흐름의 `리딩`(admin_layer1_flow.readings). 두 RPC 의 readings
    //    필터가 글자 단위로 같아서 성립한다 — 1층 기본 창도 daysAgoKstIso(6) 이라 days=7 이면
    //    같은 창이다. 2026-09-27 prod 대조: 246 == 246(7일) · 2,885 == 2,885(전 기간).
    //    쪼개기 때문에 1층의 숫자 하나가 여기서 6행으로 흩어지므로 **note 에도 노출한다** —
    //    운영자가 화면만 보고 자가검증할 수 있어야 한다(signups 표와 같은 규약).
    const rd = await supa.rpc("admin_layer2_readings", { p_since: since, p_until: null, p_exclude });
    if (rd.error) failed.push("admin_layer2_readings");
    else {
      // 🔴 BIGINT·NUMERIC 은 PostgREST 를 지나며 **문자열**로 온다 — Number() 없이 쓰면 비교도
      //    산술도 조용히 틀린다.
      type RdRow = {
        consultation_type: string;
        is_report: boolean;
        cnt: string;
        paid_cnt: string;
        ended_cnt: string;
        viewed_cnt: string;
        avg_user_turns: string | null;
      };
      // 🔴 카나리아 — 이 표의 "못 잰다"는 **앱 상수**의 주장이다. 페르소나나 라우트가 바뀌었는데
      //    reading-rows.ts 를 안 고치면 실데이터가 영원히 "—" 로 숨고, 유닛은 상수끼리만 비교하니
      //    **절대 안 깨진다**(relationship-slot-gate-drift 와 같은 클래스). 런타임 반증만이 잡는다.
      const rows = (rd.data ?? []) as RdRow[];
      const drifted = rows.filter((r) => {
        const v = readingRowView(r.consultation_type, r.is_report);
        return (
          (!v.ended && Number(r.ended_cnt) > 0) ||
          (!v.viewed && Number(r.viewed_cnt) > 0) ||
          (!v.paid && Number(r.paid_cnt) > 0)
        );
      });
      const drift = drifted.length
        ? ` 🔴 **표시 규칙이 현실과 어긋났다** — ${drifted
            .map((d) => d.consultation_type)
            .join(", ")} 에 "못 잰다"고 해둔 값이 실제로 잡혔다. lib/admin/reading-rows.ts 를 고칠 것.`
        : "";
      blocks.push({
        kind: "table",
        title: `종목별 리딩 (최근 ${days}일)`,
        // 헤더에 `(%)` 를 붙이지 않는다 — formatMetric(_, "percent") 이 이미 `%` 를 붙여
        // `완료율(%): 59.0%` 가 된다(같은 이유로 매출 표의 `(원)` 도 뺐다).
        columns: ["종목", "리딩", "유료", "완료율", "결과 열람", "평균 유저 턴"],
        rows: rows.map((r) => {
          const n = Number(r.cnt);
          // 🔴 이 행이 **무엇을 잴 수 있나** — 구조적으로 불가능한 칸은 `0`·`0.0%` 가 아니라
          //    "—" 여야 한다("쟀더니 아무도 안 했다" 와 "애초에 못 잰다"는 다르다). 판정 근거가
          //    데이터가 아니라 페르소나 파일·라우트 존재 여부·INSERT 문이라
          //    lib/admin/reading-rows.ts 가 유닛으로 잠근 채 갖고 있다.
          const view = readingRowView(r.consultation_type, r.is_report);
          // 🔴 퍼센트는 반드시 pct1 경유 — `(a/b)*1000` 으로 먼저 나누면 배정도 오차가 참값을
          //    이미 놓쳐서(201/400 → 502.4999…) 뒤에서 어떤 반올림을 해도 50.3 이 안 나온다.
          //    분모 400의 배수 계열에서 체계적으로 갈리고, 리딩 건수는 쉽게 수백~수천이다.
          const ended = view.ended ? pct1(Number(r.ended_cnt), n) : null;
          const viewed = view.viewed ? pct1(Number(r.viewed_cnt), n) : null;
          return [
            view.label,
            formatMetric(n, "count"),
            // 연애 상담은 스레드 INSERT 가 stars_spent 를 0 으로 박는다 — 돈은 패스·스킬에 있다.
            // 0 으로 찍으면 "155건인데 매출 0" 으로 읽히는데 그건 측정 결과가 아니라 저장 구조다.
            view.paid ? formatMetric(Number(r.paid_cnt), "count") : null,
            // null 은 "—" 로 둔다 — 0 으로 뭉개면 "완료가 0%" 와 "못 잰다" 가 같은 칸이 된다.
            ended === null ? null : formatMetric(ended, "percent"),
            viewed === null ? null : formatMetric(viewed, "percent"),
            // 🔴 `count` 가 아니라 `ratio` — count 로 찍으면 2.21턴이 "2" 가 되어 소수가 증발한다.
            r.avg_user_turns === null ? null : formatMetric(Number(r.avg_user_turns), "ratio"),
          ];
        }),
        // 🔴 note 에 **그날 잰 값**을 박지 않는다(같은 파일 signups 주석과 같은 규율) — 화면에
        //    렌더되는 문자열이라 낡고, 낡은 주장은 옆의 진짜 경고까지 같이 깎는다. 숫자 대신
        //    **관계**를 말한다. 검증 수치는 커밋 메시지와 마이그레이션 주석에 있다.
        // 🔴 "—" 의 이유는 **라벨이 진다**(`연애 상담(종결없음)` · `(리포트)`). 긴 문단의 n번째
        //    caveat 은 11px/35% 투명도라 안 읽힌다 — product-map.ts 가 `공통(매출없음)` 으로
        //    이미 검증한 해법이다. note 는 규칙만 한 문장으로 말한다.
        note:
          "완료 = 별콩이 발화에 **[END] 마커**가 있다(turn_close 컬럼이 아니다 — 3층 roadmap KPI 와 같은 정의). " +
          "평균 유저 턴은 **리딩당** 평균 — 메시지 0건 리딩도 0턴으로 분모에 넣는다(빼면 '한 마디도 못 하고 죽은 리딩'이 사라져 과대해진다). " +
          "🔴 **\"—\" 는 0% 가 아니라 '그 행엔 그 개념이 없다'** 는 뜻이다: 리포트는 대화가 없고, 연애 스레드는 종결·결과 화면이 없으며 그 돈은 패스·스킬이라 리딩의 유료 칸에 안 잡힌다. " +
          "🔴 **리딩 합은 같은 창 1층 '리딩'과 항상 같아야 한다** — 쪼개기는 행을 나눌 뿐 모수를 바꾸지 않는다. 어긋나면 1층과 2층이 다른 모수를 말하는 것이다. " +
          "결과 열람은 여기선 **리딩 기준** — 1층 가드레일의 결과 열람은 **코호트 기준**이라 값이 다르다(둘 다 정본, 분모가 다르다). " +
          "2026-09-12 실측: 종료 원인은 마무리 버튼 59% · 자발 13% · 무언 이탈 27%." +
          drift,
      });
      blocks.push({ kind: "link", title: "개별 리딩은", href: "/admin/readings", label: "리딩/상담" });
    }
  },
  uv: async ({ supa, since, p_exclude, blocks, failed }) => {
    // 라우트별 + 경로 판독기(스펙 §6). 새 로깅이 없다 — page_views 가 이미 모든 라우트를
    // anon 단위·시간순으로 들고 있었고, 부족했던 건 **읽는 화면**이었다.
    const PATH_LIMIT = 15;
    const [routes, seqs, exits] = await Promise.all([
      // 🔴 `p_today` 는 DEFAULT 가 없어 **필수 인자**다 — 빼면 PostgREST 가 시그니처를 못 찾아
      //    404 로 죽는다(호출 자체가 실패하지 표가 비는 게 아니다). 날짜 버킷의 단일 원천은
      //    lib/admin-time 의 kstDate 다 — 라우트에서 새로 계산하지 않는다(AGENTS.md).
      //    여기선 today_* 열을 안 그리지만 인자는 그대로 줘야 한다.
      supa.rpc("admin_traffic_routes", {
        p_since: since,
        p_exclude,
        p_today: kstDate(new Date().toISOString()),
        p_limit: PATH_LIMIT,
      }),
      supa.rpc("admin_path_sequences", {
        p_since: since,
        p_until: null,
        p_steps: 4,
        p_limit: PATH_LIMIT,
        p_exclude,
      }),
      supa.rpc("admin_path_exits", { p_since: since, p_until: null, p_limit: PATH_LIMIT, p_exclude }),
    ]);
    if (routes.error) failed.push("admin_traffic_routes");
    if (seqs.error) failed.push("admin_path_sequences");
    if (exits.error) failed.push("admin_path_exits");

    if (!routes.error) {
      // 🔴 BIGINT 는 PostgREST 를 지나며 문자열로 온다 → Number() 전수.
      type RouteRow = { path: string; uv: string; pv: string };
      const raw = (routes.data ?? []) as RouteRow[];
      // 🔴 `/admin*` 은 **앱에서** 거른다. 이 섹션의 다른 두 블록은 RPC 안에서 이미 빼는데
      //    `admin_traffic_routes` 는 /admin/traffic 과 공유라 못 고친다 — 안 거르면 한 섹션
      //    안에서 위 표와 아래 표의 경로 범위가 달라진다(이 대시보드의 존재 이유가 "정의가
      //    둘이면 화면이 거짓말한다" 인데 그게 한 화면 안에서 일어난다).
      //    실측(2026-09-27 prod, 7일 창): 제외 목록이 비면 `/admin` 이 PV 96 으로 **12위** —
      //    15칸 중 한 칸을 운영자 자신이 먹는다. 분석 제외 6명을 넣고 돌리면 `/admin%` 가
      //    0행이 되지만 **그건 env(ADMIN_USER_IDS) 값에 기댄 우연이다.** 경로 범위가 운영
      //    설정에 따라 달라지면 안 되므로(그게 바로 정의가 둘인 상태다) 코드로 고정한다.
      // 🔴 절단 판정은 **필터 전** 행 수로 한다. 필터 후로 재면 `/admin` 을 걸러 14행이 된
      //    순간 경고가 조용히 꺼진다 — 잘렸는데 안 보이는 게 이 클래스의 원래 사고다.
      const truncated = raw.length >= PATH_LIMIT;
      const rows = raw.filter((r) => !r.path.startsWith("/admin"));
      if (rows.length) {
        blocks.push({
          kind: "table",
          title: "라우트별 UV/PV",
          columns: ["라우트", "UV", "PV"],
          // 🔴 셀은 전부 포맷터를 거친다(TableBlock.rows 가 string 인 이유) — raw number 를
          //    넣으면 천단위 구분자 없는 `1731` 이 되고 같은 화면의 다른 표는 `1,731` 이 된다.
          rows: rows.map((r) => [
            r.path,
            formatMetric(Number(r.uv), "count"),
            formatMetric(Number(r.pv), "count"),
          ]),
          // 🔴 절단은 **눈에 보여야** 한다(AGENTS.md). RPC 가 자기 안에서 자르므로 전체 개수를
          //    알 수 없다 — "잘렸다" 가 아니라 "잘렸을 수 있다" 가 아는 것의 전부다.
          // ⚠️ note 는 화면에 그대로 찍힌다. BlockNote 는 **굵게** 만 파싱하므로 백틱을 쓰면
          //    백틱이 리터럴로 보인다(Task 8 splitEmphasis).
          note:
            (truncated
              ? `⚠️ PV 큰 순 **${PATH_LIMIT}개만** 가져왔다 — 잘린 라우트가 있을 수 있다. `
              : "") +
            "UV 는 anon 쿠키 단위 · 봇 제외 · 어드민 제외(로그인한 행 기준). " +
            "**/admin 으로 시작하는 어드민 화면은 뺐다** — 아래 경로·이탈 블록과 같은 범위다. ⚠️ 아래 링크의 트래픽 화면은 안 빼므로 거기 라우트 표와 행이 다를 수 있다. " +
            "⚠️ 이 UV 는 라우트마다 따로 센 distinct 라 **열을 더해도 화면 전체 UV 가 되지 않는다**(한 사람이 여러 라우트를 본다).",
        });
      }
    }

    if (!seqs.error) {
      type SeqRow = { seq: string; people: string; logged_in: string; paid: string };
      const rows = (seqs.data ?? []) as SeqRow[];
      if (rows.length) {
        blocks.push({
          kind: "table",
          title: "첫 4스텝 경로",
          // 🔴 헤더에 `(%)` 를 붙이지 않는다 — formatMetric(_, "percent") 이 이미 `%` 를 붙여
          //    `로그인(%) 97.2%` 가 된다.
          columns: ["경로", "인원", "로그인", "결제"],
          rows: rows.map((r) => {
            const n = Number(r.people);
            // 🔴 퍼센트는 pct1 경유다. `(a/n)*1000/10` 처럼 **나누고 곱하면** 그 double 이
            //    이미 참값이 아니라(201/400 → 50.2, 참값 50.25) 뒤에서 뭘 해도 못 고친다.
            //    pct1 은 ×1000 을 먼저 곱해 나눗셈을 한 번만 한다. den<=0 이면 null 이라
            //    호출부의 삼항도 필요 없다(lib/admin/layer1.ts).
            const login = pct1(Number(r.logged_in), n);
            const paid = pct1(Number(r.paid), n);
            return [
              r.seq,
              formatMetric(n, "count"),
              login === null ? null : formatMetric(login, "percent"),
              paid === null ? null : formatMetric(paid, "percent"),
            ];
          }),
          note:
            (rows.length >= PATH_LIMIT
              ? `⚠️ 인원 많은 순 **${PATH_LIMIT}개만** 가져왔다 — 잘린 경로가 있을 수 있다. `
              : "") +
            "**anon 쿠키 단위** 첫 4스텝이다(세션 단위가 아니다) · 봇 · 어드민 화면 · 어드민 계정 제외. " +
            "로그인·결제는 첫 4스텝 **밖의** 도달도 센다 — 경로가 로그인으로 끝나지 않아도 그 사람이 창 안에서 로그인했으면 센다. " +
            "2026-09-20 기준 30일 실측: **/login 도달 1,531명** 중 로그인 성공 **67.5~67.6%** — 약 500명이 로그인 없이 이탈했다. " +
            "⚠️ '결제' 는 **그 경로를 탄 사람 중 결제 이력이 있는 비율**이지 그 경로가 결제로 이어졌다는 뜻이 아니다(결제 시점은 이 창 밖일 수 있다). " +
            "⚠️ 어드민 제외는 **로그인한 계정으로만** 걸린다 — 운영자가 **로그아웃 상태로** QA 하면 안 걸러진다.",
        });
      }
    }

    if (!exits.error) {
      type ExitRow = { path: string; people: string };
      const items = ((exits.data ?? []) as ExitRow[]).map((r) => ({
        label: r.path,
        value: Number(r.people),
      }));
      if (items.length) {
        blocks.push({
          kind: "bars",
          title: "이탈 지점 (창 안에서 마지막으로 본 화면)",
          unit: "count",
          items,
          // 🔴 막대에도 절단 경고를 붙인다 — 표 2개에만 붙이면 같은 섹션 안에서 규칙이 갈리고,
          //    막대는 "없는 항목"이 더 안 보인다(실측 7일: 이탈 path 29개 중 15개만 그려진다).
          note:
            (items.length >= PATH_LIMIT
              ? `⚠️ 인원 많은 순 **${PATH_LIMIT}개만** 가져왔다 — 잘린 화면이 있을 수 있다. `
              : "") +
            "⚠️ '이 창에서 마지막으로 본 화면' 이지 **서비스를 떠났다는 뜻이 아니다** — 창 끝에 걸린 사람은 다음 날 다시 온다. 창을 길게 잡을수록 진짜 이탈에 가까워진다.",
        });
      }
    }

    blocks.push({ kind: "link", title: "유입별·방문자 구성은", href: "/admin/traffic", label: "트래픽 UV/PV" });
  },
  // 1층 'D7 재방문' 을 펼친 자리 — **코호트가 어디서 무너지나** 와 **무료 상품이 잔존을 올리나**.
  //
  // 🔴 `days` 를 코호트 창으로 쓰지 않는다(그래서 이 핸들러만 ctx 에서 days 를 안 받는다) —
  //    7일 코호트에 7일 성숙을 요구하면 분모가 빈다(Task 7 실측: 7일 창 0명 / 30일 창 640명).
  //    1층이 같은 이유로 p_retention_since 를 별도 인자로 받았다. 여기는 주 버킷 8개 고정이다.
  d7: async ({ supa, p_exclude, blocks, failed }) => {
    const WEEKS = 8;
    const FREE_LIFT = [
      { key: "byeoljari", label: "별 인연 별자리" },
      { key: "saju_mbti", label: "사주 MBTI" },
      { key: "byeolmaru", label: "별마루 구독" },
    ];
    // 안쪽 Promise.all 로 한 번 더 묶는다 — 성격이 다른 두 결과 묶음에 각각 이름이 붙어
    // 아래 분기가 읽힌다(signups 섹션과 같은 형태). 플랫하게 spread 하면 인덱스 산술이 된다.
    const [ret, lifts] = await Promise.all([
      supa.rpc("admin_layer2_retention", { p_weeks: WEEKS, p_exclude }),
      Promise.all(
        FREE_LIFT.map((p) =>
          supa.rpc("admin_free_product_lift", { p_product: p.key, p_exclude })
        )
      ),
    ]);

    if (ret.error) failed.push("admin_layer2_retention");
    else {
      // 🔴 BIGINT 는 PostgREST 를 지나며 문자열로 온다 → Number() 전수. Dn 은 **성숙 전이면
      //    RPC 가 NULL 을 준다** — 0 이 아니다(0 이면 "쟀더니 아무도 안 왔다"로 읽힌다).
      type RetRow = {
        cohort_week: string;
        users: string;
        d1: string | null;
        d3: string | null;
        d7: string | null;
        d14: string | null;
        d28: string | null;
      };
      const rows = (ret.data ?? []) as RetRow[];
      if (rows.length) {
        blocks.push({
          kind: "table",
          title: `주 코호트 리텐션 (최근 ${WEEKS}주)`,
          // 🔴 헤더에 `(%)` 를 붙이지 않는다 — formatMetric(_, "percent") 이 이미 `%` 를 붙여
          //    `D7(%) 8.9%` 가 된다(Task 10~13 이 `(원)`·`(%)` 를 같은 이유로 뺐다).
          columns: ["가입 주", "인원", "D1", "D3", "D7", "D14", "D28"],
          rows: rows.map((r) => {
            const n = Number(r.users);
            // 🔴 못 그리는 칸이 둘이다: ①RPC 가 NULL 을 준 미성숙 칸 ②곡선 소표본.
            //    임계의 단일 원천은 lib/admin-metrics.ts 의 MIN_SAMPLE — 여기 숫자를 박으면
            //    임계를 바꿀 때 두 곳이 되어 조용히 갈린다.
            // 🔴 퍼센트는 pct1 경유다. `(a/n)*1000/10` 처럼 **나누고 곱하면** 그 double 이
            //    이미 참값이 아니라(201/400 → 50.2, 참값 50.25) 뒤에서 뭘 해도 못 고친다.
            const cell = (v: string | null) => {
              if (v === null || n < MIN_SAMPLE.CURVE) return null;
              const p = pct1(Number(v), n);
              return p === null ? null : formatMetric(p, "percent");
            };
            return [
              r.cohort_week,
              formatMetric(n, "count"),
              cell(r.d1),
              cell(r.d3),
              cell(r.d7),
              cell(r.d14),
              cell(r.d28),
            ];
          }),
          note:
            "Dn = 가입 후 n일이 지난 **뒤에도** 방문 기록이 있나(마지막 방문 기준) — 1층 'D7 재방문'과 **같은 정의**다. 다른 건 코호트 창뿐이라(1층은 30일 롤링 · 여기는 주 버킷) 두 값이 정확히 같지는 않다. " +
            "🔴 **빈 칸은 0% 가 아니라 '아직 못 잰다'** 는 뜻이다 — 그 주 가입자 **전원**이 n일을 채운 뒤에만 칸을 연다. " +
            "성숙 기준을 **주의 마지막 날**로 잡은 이유: 분모가 그 주 가입자 전원이라, 주 시작일로 열면 아직 n일을 못 채운 사람이 분모에 남아 값이 구조적으로 깎인 채 그려진다. " +
            `인원이 **${MIN_SAMPLE.CURVE}명**(리텐션 곡선 소표본 임계) 미만인 주도 비율을 그리지 않는다. ` +
            "⚠️ 맨 위 주는 **아직 진행 중**이라 인원이 계속 는다(그래서 칸도 전부 비어 있다). " +
            "🔴 **세로로 비교하지 말 것** — Dn 은 '가입 후 n일이 지난 뒤에 **언젠가** 왔나' 라 코호트가 오래될수록 관측 기간이 길어 계속 오른다. 아래(오래된) 행이 높은 건 리텐션이 좋았다는 뜻이 아닐 수 있다. 1층과 정의를 맞추느라 그대로 뒀다. " +
            "⚠️ 방문은 봇 제외 page_views 이고 **창을 걸지 않는다** — 코호트 창 밖에 돌아온 방문도 센다(1층과 같은 규약).",
        });
      }
    }

    // 🔴 리프트 표는 리텐션의 성패와 무관하게 항상 그린다(설명되는 비대칭) — 서로 다른 RPC 이고,
    //    코호트 곡선이 안 보인다고 무료 상품의 잔존 기여까지 가릴 이유가 없다(signups 와 같은 규약).
    const liftRows = FREE_LIFT.map((p, i) => {
      const res = lifts[i];
      if (res.error) {
        failed.push(`admin_free_product_lift(${p.key})`);
        // null 은 화면에서 "—" — 0 으로 채우면 "접촉자가 없었다" 는 **거짓말**이 된다.
        return [p.label, null, null, null, null];
      }
      const r = ((res.data ?? []) as Record<string, string | null>[])[0];
      const touched = Number(r?.touched ?? 0);
      const untouched = Number(r?.untouched ?? 0);
      // 소표본 게이트 — 평균은 표본이 MIN_SAMPLE.RATE 미만이면 숫자를 그리지 않는다(스펙 §7).
      // 🔴 **양쪽에 같은 규칙**을 건다. 플랜은 접촉자만 걸었는데, 비접촉자가 수천 명이라 실질
      //    차이가 없다는 게 같은 표 안에서 규칙이 한쪽에만 걸릴 이유는 못 된다.
      // 평균 방문일은 소수라 `count` 로 찍으면 4.94일이 "5" 가 되어 의미가 뭉개진다 → ratio.
      const avg = (n: number, v: string | null | undefined) =>
        n < MIN_SAMPLE.RATE || v == null ? null : formatMetric(Number(v), "ratio");
      return [
        p.label,
        formatMetric(touched, "count"),
        avg(touched, r?.touched_avg_days),
        formatMetric(untouched, "count"),
        avg(untouched, r?.untouched_avg_days),
      ];
    });
    blocks.push({
      kind: "table",
      title: "무료 상품 접촉 × 방문일수",
      columns: ["상품", "접촉자", "접촉자 평균 방문일", "비접촉자", "비접촉자 평균 방문일"],
      rows: liftRows,
      note:
        "🔴 무료 상품을 '전환율'로 재지 않는다 — 2026-08-24 실측에서 무료→결제는 깔때기가 아니라 **역인과**였다(무료가 결제자를 만든 게 아니라 결제자가 무료를 구경했다). 그래서 이 표는 **잔존**을 본다. " +
        "🔴 **인과가 아니다** — 무료 상품을 쓰는 사람이 원래 더 오래 남는 사람일 수 있다(선택 편향). 차이가 커도 '무료 상품이 리텐션을 올렸다'로 읽으면 안 된다. " +
        "⚠️ 같은 2026-08-24 판독의 단서: 리텐션 쪽 유일한 긍정 신호는 **데일리형** 무료 콘텐츠에서 나왔고 별자리·MBTI 는 **공유 바이럴형이라 다른 종**이다 — 그 신호를 이 표로 옮겨 읽지 말 것. " +
        `⚠️ 방문일은 **전 기간 누적**이라(창이 없다) 일찍 가입한 사람일수록 크다. 접촉자·비접촉자 중 **${MIN_SAMPLE.RATE}명 미만인 쪽**은 평균을 그리지 않는다(같은 규칙을 양쪽에 건다). ` +
        "⚠️ 별자리 접촉자는 **맵을 만든 사람**이다(star_maps 의 주인) — 맵에 이름이 적힌 멤버는 호스트가 손으로 넣은 타인이라 계정이 없어 못 센다. " +
        "⚠️ 별마루 구독은 별마루가 **배포된 환경에서만** 값이 쌓인다 — 없는 환경의 0 은 배선 문제가 아니라 구조적으로 당연한 값이다.",
    });
  },
  withdrawal: async ({ supa, since, days, blocks, failed }) => {
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
  },
};
