// app/api/admin/ads/import/route.ts — 메타 Ads Manager CSV 일괄 업로드.
// Day 분해로 내보낸 CSV 를 파싱해 ad_spend 로 upsert. 소재 매칭: Ad name = utm_content.
// 같은 (일자·플랫폼·캠페인·광고세트·소재)는 덮어씀 → 재업로드 안전.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// quote-aware CSV 파서 (따옴표 안 쉼표/줄바꿈, "" 이스케이프 처리)
function parseCsv(text: string): string[][] {
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function findCol(headers: string[], ...needles: string[]): number {
  for (const n of needles) {
    const i = headers.findIndex((h) => h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

function num(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;

  const b = await req.json().catch(() => null);
  const csv = typeof b?.csv === "string" ? b.csv : "";
  if (!csv.trim()) {
    return NextResponse.json({ error: "CSV 내용이 비어있어요." }, { status: 400 });
  }

  const table = parseCsv(csv);
  if (table.length < 2) {
    return NextResponse.json({ error: "데이터 행이 없어요." }, { status: 400 });
  }
  const headers = table[0].map((h) => h.trim().toLowerCase());
  const idx = {
    date: findCol(headers, "day", "date", "reporting starts"),
    campaign: findCol(headers, "campaign"),
    adset: findCol(headers, "ad set"),
    ad: findCol(headers, "ad name"),
    spend: findCol(headers, "amount spent", "지출"),
    impr: findCol(headers, "impression", "노출"),
    clicks: findCol(headers, "link click", "clicks", "클릭"),
    reach: findCol(headers, "reach", "도달"),
  };
  if (idx.date < 0 || idx.spend < 0) {
    return NextResponse.json(
      {
        error:
          "필수 컬럼을 못 찾았어요. 메타에서 'Day(일자)' 분해 + 'Amount spent(지출)' 포함해 내보냈는지 확인해줘.",
      },
      { status: 400 }
    );
  }

  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const date = (r[idx.date] ?? "").trim();
    const spend = num(r[idx.spend]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || spend == null) {
      skipped++;
      continue;
    }
    rows.push({
      spend_date: date,
      platform: "meta",
      campaign: idx.campaign >= 0 ? (r[idx.campaign] ?? "").trim() : "",
      adset: idx.adset >= 0 ? (r[idx.adset] ?? "").trim() : "",
      creative_key: idx.ad >= 0 ? (r[idx.ad] ?? "").trim() : "",
      impressions: idx.impr >= 0 ? num(r[idx.impr]) : null,
      clicks: idx.clicks >= 0 ? num(r[idx.clicks]) : null,
      spend_won: Math.round(spend),
      reach: idx.reach >= 0 ? num(r[idx.reach]) : null,
      created_by: gate.userId,
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "유효한 행이 없어요 (일자 형식 YYYY-MM-DD · 지출 값 확인).", skipped },
      { status: 400 }
    );
  }

  const { error } = await getServiceSupabase()
    .from("ad_spend")
    .upsert(rows, {
      onConflict: "spend_date,platform,campaign,adset,creative_key",
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction({
    adminId: gate.userId,
    action: "ad_spend_upsert",
    targetType: "ad_spend",
    targetId: null,
    payload: { imported: rows.length, skipped },
  });
  return NextResponse.json({ ok: true, imported: rows.length, skipped });
}
