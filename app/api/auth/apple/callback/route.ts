// 애플 form_post 콜백 — 교차 사이트 POST 라 Lax 쿠키(state·유입 acq·anon·_fbp)가 안 실려 온다.
// 여기선 아무것도 판단하지 않고, 받은 값을 우리 페이지에서 같은 출처 POST(/api/auth/apple/complete)로 다시 보낸다 —
// 같은 출처 요청엔 Lax 쿠키가 실려 가입 처리(유입 기록·CAPI)가 카카오와 똑같이 돈다(lib/auth/apple-web.ts).
// proxy.ts 는 이 경로에서 익명 쿠키를 새로 심지 않는다 — 안 실려 왔을 뿐 브라우저엔 있다(심으면 기존 anon 을 덮어쓴다).
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
      // no-referrer 면 자동 제출 POST 의 Origin 이 'null' 이 된다(Fetch 표준) — 이 주소엔 비밀이 없으니 같은 출처로만 보낸다
      "Referrer-Policy": "same-origin",
    },
  });
}
