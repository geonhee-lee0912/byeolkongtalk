// 사주 결정적 계산 — manseryeok wrapper 위에 입력 검증만.
// Phase 5 (b) 시점: 로그인 가드 없이 누구나 호출 가능 (DB 저장 없음).
// (c) 채팅 진입 시점에 로그인 + readings INSERT.

import { NextRequest, NextResponse } from "next/server";
import { calcSaju, canCalcSaju, type SajuInput, type SajuGender } from "@/lib/saju/calc";
import { logError, ctxFromRequest } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

function validateInput(body: unknown): SajuInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;

  const year = b.year;
  const month = b.month;
  const day = b.day;
  if (!isInt(year) || year < 1900 || year > 2100)
    return { error: "invalid_year" };
  if (!isInt(month) || month < 1 || month > 12) return { error: "invalid_month" };
  if (!isInt(day) || day < 1 || day > 31) return { error: "invalid_day" };

  const hour =
    b.hour === null || b.hour === undefined
      ? null
      : isInt(b.hour) && b.hour >= 0 && b.hour <= 23
        ? b.hour
        : NaN;
  if (Number.isNaN(hour)) return { error: "invalid_hour" };

  const minute =
    b.minute === null || b.minute === undefined
      ? null
      : isInt(b.minute) && b.minute >= 0 && b.minute <= 59
        ? b.minute
        : NaN;
  if (Number.isNaN(minute)) return { error: "invalid_minute" };

  const gender = b.gender;
  if (gender !== "male" && gender !== "female" && gender !== "other")
    return { error: "invalid_gender" };

  const input: SajuInput = {
    year,
    month,
    day,
    hour,
    minute,
    isLunar: b.isLunar === true,
    isLeapMonth: b.isLeapMonth === true,
    gender: gender as SajuGender,
  };
  // 그달에 없는 음력 30·31일·없는 윤달·없는 양력 날짜는 calcSaju 가 throw 한다 — 500("internal") 대신 400.
  // (위에서 연·월·일·시·분 범위를 이미 걸렀으니 false 는 "그 날·그 윤달이 없다"뿐 — 범위 검사를 풀면 이 전제도 깨진다)
  if (!canCalcSaju(input)) {
    return { error: input.isLunar ? "invalid_lunar_date" : "invalid_day" };
  }
  return input;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const result = validateInput(body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const saju = calcSaju(result);
    return NextResponse.json({ saju });
  } catch (err) {
    await logError(
      err,
      ctxFromRequest(req, { route: "/api/consultations/saju/calc" })
    );
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
