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
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 7)));
  const since = daysAgoKstIso(days - 1);

  const supa = getServiceSupabase();
  const p_exclude = adminExclusionArray();
  const blocks: Layer2Block[] = [];
  const failed: string[] = [];

  if (sectionRaw === "revenue") {
    // 별 소모 5종 — 1층에서 내려온 것(스펙 §3). /admin/analytics 와 **같은 RPC** 를 창만 맞춰 쓴다.
    // 유효 운세 타입은 앱이 단일 원천 — 하드코딩하면 FORTUNE_CONFIG 추가 시 조용히 드리프트한다.
    const spend = await supa.rpc("admin_star_spend_breakdown", {
      p_since: since,
      p_until: null,
      p_exclude,
      p_fortune_types: Object.keys(FORTUNE_CONFIG),
    });
    if (spend.error) failed.push("admin_star_spend_breakdown");
    else {
      // RPC 는 (domain, product, cnt, stars, free_stars, users) 를 준다 — 여기서 쓰는 3개만 선언한다.
      // 🔴 BIGINT 는 PostgREST 를 지나며 문자열로 온다 → Number() 필수(빼면 문자열 연결로 조용히 틀린다).
      type SpendRow = { domain: string; product: string; stars: string };
      const rows = (spend.data ?? []) as SpendRow[];
      const isRelSkill = (r: SpendRow) => r.domain === "relationship" && r.product.startsWith("스킬:");
      const sum = (pred: (r: SpendRow) => boolean) =>
        rows.filter(pred).reduce((s, r) => s + Number(r.stars), 0);
      blocks.push({
        kind: "bars",
        title: "별 소모 5종",
        unit: "count",
        items: [
          { label: "타로 대화", value: sum((r) => r.domain === "tarot") },
          { label: "운세 리포트", value: sum((r) => r.domain === "fortune") },
          { label: "인챗 업셀", value: sum((r) => r.domain === "upsell") },
          { label: "연애 상담", value: sum((r) => r.domain === "relationship" && !isRelSkill(r)) },
          { label: "연애 스킬", value: sum(isRelSkill) },
        ],
        note: "별 소모는 매출이 아니다 — 무료별이 섞여 있다. 원화 기여는 '기여 ▾'에서 본다.",
      });
      blocks.push({
        kind: "link",
        title: "상품별·코호트별 상세는",
        href: "/admin/analytics",
        label: "애널리틱스",
      });
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
        note: "창은 전부 KST 자정 기준. 🔴 어드민·테스트 계정을 분자에서 뺄 수 없다 — account_withdrawals 는 kakao_id_hash 만 남기고 user_id 를 안 남긴다(탈퇴 = 유저 삭제). 실제보다 소폭 높게 나온다.",
      });
    }

    if (!wFailed && !uAll.error) {
      // 탈퇴율 = 탈퇴 / (현재 유저 + 탈퇴). 탈퇴는 users 를 지우므로 "총 가입 이력" 을 이렇게 복원한다.
      const wAllN = wAll.count ?? 0;
      const usersN = uAll.count ?? 0;
      const den = usersN + wAllN;
      blocks.push({
        kind: "table",
        title: "누적 탈퇴율",
        columns: ["탈퇴(누적)", "현재 유저", "가입대비"],
        rows: [
          [
            formatMetric(wAllN, "count"),
            formatMetric(usersN, "count"),
            den > 0 ? formatMetric((wAllN / den) * 100, "percent") : null,
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
