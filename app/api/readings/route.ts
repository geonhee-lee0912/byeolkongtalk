// readings INSERT — 사주 풀이 세션 시작 시 호출.
//
// 흐름: 입력 검증 → 잔액 사전 확인 → user_profiles INSERT → readings INSERT → spendStars(20)
//      → 실패 시 readings/profile 롤백.
//
// Phase 5 (c) 시점: 자기 사주만 입력 (isPrimary 결정 = user 의 첫 self profile 인지). 가족/지인은 추후.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { spendStars, getStarBalance } from "@/lib/stars";
import { SAJU_READING_COST } from "@/lib/saju/constants";
import { calcTemporalLuck } from "@/lib/saju/calc";
import { isSajuProduct, type SajuProduct } from "@/lib/saju/products";
import { logError, ctxFromRequest } from "@/lib/logger";
import { EMOTION_OPTIONS } from "@/lib/emotions";
import { validateProfile, type ProfileInput } from "@/lib/saju/profile-input";
import { fortuneTypeFromTag } from "@/lib/fortune/types";

// 별콩이 답변 도입부 미리보기용 — 카드/종료 마커 제거 후 한 줄로 정리하고 절단.
function buildPreview(content: string): string {
  const cleaned = content
    .replace(/\[CARD:\d+\]/g, "")
    .replace(/\[END\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 90 ? cleaned.slice(0, 90) + "…" : cleaned;
}

const VALID_EMOTIONS = EMOTION_OPTIONS.map((o) => o.tag) as string[];

export const dynamic = "force-dynamic";

// GET /api/readings — 본인 readings 리스트 (마이페이지용)
export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ readings: [] });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("readings")
    .select(
      "id, question, saju_data, consultation_type, spread_type, saju_product, drawn_cards, emotion_tag, stars_spent, has_sensitive, created_at, profile:user_profiles(display_name, relation_type)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ readings: [], error: error.message }, { status: 500 });
  }

  // 종료 여부 — assistant 메시지에 [END] 마커가 있으면 마무리된 풀이.
  // 마커가 없는 풀이는 "이어할 수 있는 대화" 로 노출.
  // '이어하기' 는 타로 상담만 해당 → 타로 reading 만 [END] 스캔 (사주/운세는 스킵).
  const tarotIds = (data ?? [])
    .filter((r) => r.consultation_type === "tarot")
    .map((r) => r.id);
  const endedSet = new Set<string>();
  if (tarotIds.length > 0) {
    const { data: endedRows } = await supabase
      .from("messages")
      .select("reading_id")
      .in("reading_id", tarotIds)
      .eq("role", "assistant")
      .ilike("content", "%[END]%");
    for (const row of endedRows ?? []) endedSet.add(row.reading_id);
  }

  // 운세 리포트 생성 중 판정 — 운세 리딩인데 assistant 메시지가 아직 없으면 백그라운드 생성 중.
  const fortuneIds = (data ?? [])
    .filter((r) => fortuneTypeFromTag(r.emotion_tag))
    .map((r) => r.id);
  const hasMsgSet = new Set<string>();
  if (fortuneIds.length > 0) {
    const { data: msgRows } = await supabase
      .from("messages")
      .select("reading_id")
      .in("reading_id", fortuneIds)
      .eq("role", "assistant");
    for (const row of msgRows ?? []) hasMsgSet.add(row.reading_id);
  }

  // 미리보기 — 각 reading 의 첫 assistant 메시지 도입부.
  // (reading_id, created_at) 인덱스 활용. 전체 assistant 메시지를 created_at 오름차순으로
  // 가져와, reading 별 첫 행만 채택한다.
  const allIds = (data ?? []).map((r) => r.id);
  const previewMap = new Map<string, string>();
  if (allIds.length > 0) {
    const { data: previewRows } = await supabase
      .from("messages")
      .select("reading_id, content, created_at")
      .in("reading_id", allIds)
      .eq("role", "assistant")
      .order("created_at", { ascending: true });
    for (const row of previewRows ?? []) {
      if (!previewMap.has(row.reading_id)) {
        previewMap.set(row.reading_id, buildPreview(row.content));
      }
    }
  }

  return NextResponse.json({
    readings: (data ?? []).map((r) => ({
      id: r.id,
      question: r.question,
      sajuData: r.saju_data,
      consultationType: r.consultation_type,
      spreadType: r.spread_type,
      sajuProduct: r.saju_product,
      drawnCards: r.drawn_cards,
      emotionTag: r.emotion_tag,
      starsSpent: r.stars_spent,
      hasSensitive: r.has_sensitive,
      createdAt: r.created_at,
      ended: endedSet.has(r.id),
      generating: fortuneIds.includes(r.id) && !hasMsgSet.has(r.id),
      profile: r.profile,
      preview: previewMap.get(r.id) ?? null,
    })),
  });
}

interface ReadingPostBody {
  profileId?: string; // 저장된 프로필 재사용 (소유권 확인)
  profile?: ProfileInput; // inline 입력 (일회성 또는 save=true 시 신규 저장)
  save?: boolean; // inline 입력을 지인 목록에 저장할지
  sajuData: unknown; // SajuResult 직렬화 — 그대로 JSONB 저장
  question: string;
  emotion?: string; // 감정 분류 (홈에서 고른 태그) — 없으면 null 저장
  sajuProduct?: string; // 사주 상품 — 화이트리스트 검증, 없으면 today_letters
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json(
      { error: "Login required", code: "LOGIN_REQUIRED" },
      { status: 401 }
    );
  }

  let body: ReadingPostBody;
  try {
    body = (await request.json()) as ReadingPostBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    !body.sajuData ||
    typeof body.sajuData !== "object" ||
    Array.isArray(body.sajuData)
  ) {
    return NextResponse.json({ error: "invalid_saju_data" }, { status: 400 });
  }

  if (
    typeof body.question !== "string" ||
    body.question.length < 1 ||
    body.question.length > 500
  ) {
    return NextResponse.json({ error: "invalid_question" }, { status: 400 });
  }

  const sajuProduct: SajuProduct = isSajuProduct(body.sajuProduct)
    ? body.sajuProduct
    : "today_letters";

  // 잔액 사전 확인 (UX 빠른 실패)
  const balance = await getStarBalance(userId);
  if (balance < SAJU_READING_COST) {
    return NextResponse.json(
      {
        error: "Insufficient stars",
        code: "INSUFFICIENT_STARS",
        balance,
        required: SAJU_READING_COST,
      },
      { status: 402 }
    );
  }

  const supabase = getServiceSupabase();

  // profile_id 결정: profileId(재사용) | inline+save(신규) | inline 일회성(null)
  let resolvedProfileId: string | null = null;
  let birthDateForLuck: string;

  if (typeof body.profileId === "string" && body.profileId.length > 0) {
    // 저장된 프로필 재사용 — 소유권 + birth 로드
    const { data: owned } = await supabase
      .from("user_profiles")
      .select("id, birth_date")
      .eq("id", body.profileId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
    }
    resolvedProfileId = owned.id;
    birthDateForLuck = owned.birth_date;
  } else {
    // inline 입력 (일회성 또는 저장)
    const profileValidated = validateProfile(body.profile);
    if ("error" in profileValidated) {
      return NextResponse.json({ error: profileValidated.error }, { status: 400 });
    }
    const profile = profileValidated;
    birthDateForLuck = profile.birthDate;

    if (body.save === true) {
      // 지인 목록에 저장 (self 면 기존 self/primary 없을 때만 primary)
      let isPrimary = false;
      if (profile.relationType === "self") {
        const { data: existing } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("user_id", userId)
          .eq("is_primary", true)
          .maybeSingle();
        if (!existing) isPrimary = true;
      }
      const { data: profileRow, error: pErr } = await supabase
        .from("user_profiles")
        .insert({
          user_id: userId,
          display_name: profile.displayName,
          relation_type: profile.relationType,
          birth_date: profile.birthDate,
          birth_time: profile.birthTime,
          is_lunar_input: profile.isLunarInput,
          is_leap_month: profile.isLeapMonth,
          gender: profile.gender,
          is_primary: isPrimary,
        })
        .select("id")
        .single();
      if (pErr || !profileRow) {
        await logError(pErr ?? new Error("profile insert null"), {
          route: "/api/readings",
          userId,
          extra: { stage: "profile_insert" },
        });
        return NextResponse.json(
          { error: pErr?.message ?? "profile_insert_failed" },
          { status: 500 }
        );
      }
      resolvedProfileId = profileRow.id;
    }
    // save=false → resolvedProfileId 는 null (일회성)
  }

  // 출생 연도 (대운 참고 나이용) — birthDate "YYYY-MM-DD"
  const birthYear = Number(birthDateForLuck.slice(0, 4));

  // 오늘 기준 시간 기둥 — good_days 면 30일 일진 포함
  const temporal = calcTemporalLuck(new Date(), birthYear, {
    includeMonth: sajuProduct === "good_days",
  });

  // saju_data 에 temporal 병합 (legacy 호출이면 sajuData 그대로 + temporal)
  const sajuDataWithTemporal = {
    ...(body.sajuData as Record<string, unknown>),
    temporal,
  };

  // 감정 태그 — 화이트리스트에 없으면 무시 (null 저장)
  const emotionTag =
    typeof body.emotion === "string" && VALID_EMOTIONS.includes(body.emotion)
      ? body.emotion
      : null;

  // readings INSERT
  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .insert({
      user_id: userId,
      profile_id: resolvedProfileId,
      question: body.question,
      saju_data: sajuDataWithTemporal,
      emotion_tag: emotionTag,
      stars_spent: SAJU_READING_COST,
      saju_product: sajuProduct,
      has_sensitive: false,
    })
    .select("id")
    .single();

  if (rErr || !reading) {
    // 이번 요청에서 새로 만든 프로필만 롤백 (재사용/일회성은 건드리지 않음)
    if (resolvedProfileId && body.save === true && !body.profileId) {
      await supabase.from("user_profiles").delete().eq("id", resolvedProfileId);
    }
    await logError(rErr ?? new Error("reading insert null"), {
      route: "/api/readings",
      userId,
      extra: { stage: "reading_insert" },
    });
    return NextResponse.json(
      { error: rErr?.message ?? "reading_insert_failed" },
      { status: 500 }
    );
  }

  // 별 차감 RPC
  const spend = await spendStars(userId, SAJU_READING_COST, {
    readingId: reading.id,
    source: "saju_reading",
  });
  if (!spend.success) {
    // readings + profile 롤백
    await supabase.from("readings").delete().eq("id", reading.id);
    // 이번 요청에서 새로 만든 프로필만 롤백 (재사용/일회성은 건드리지 않음)
    if (resolvedProfileId && body.save === true && !body.profileId) {
      await supabase.from("user_profiles").delete().eq("id", resolvedProfileId);
    }
    return NextResponse.json(
      {
        error: "Insufficient stars",
        code: "INSUFFICIENT_STARS",
        reason: spend.reason,
        balance: spend.balance,
        required: SAJU_READING_COST,
      },
      { status: 402 }
    );
  }

  return NextResponse.json({
    id: reading.id,
    success: true,
    cost: SAJU_READING_COST,
    balance: spend.balance,
    transactionId: spend.transactionId,
  });
}
