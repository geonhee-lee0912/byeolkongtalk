// 애플 form_post 콜백 — 교차 사이트 POST 라 Lax 쿠키(state·유입 acq·anon·_fbp)가 안 실려 온다.
// 여기선 아무것도 판단하지 않고, 받은 값을 우리 페이지에서 같은 출처 POST(/api/auth/apple/complete)로 다시 보낸다 —
// 같은 출처 요청엔 Lax 쿠키가 실려 가입 처리(유입 기록·CAPI)가 카카오와 똑같이 돈다(lib/auth/apple-web.ts).
import { NextResponse, type NextRequest } from "next/server";
import { APPLE_FIELD_MAX, APPLE_FORM_FIELDS, renderAutoPostForm } from "@/lib/auth/apple-web";

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const fields: Record<string, string> = {};
  for (const k of APPLE_FORM_FIELDS) {
    const v = form?.get(k);
    if (typeof v === "string" && v.length <= APPLE_FIELD_MAX) fields[k] = v;
  }
  return new NextResponse(renderAutoPostForm("/api/auth/apple/complete", fields), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
