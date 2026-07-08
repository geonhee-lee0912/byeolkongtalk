// app/api/admin/popups/route.ts — 안내 팝업 발송 (targetUserId 없으면 전체 발송).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;

  const { title, body, imageUrl, targetUserId } = await req
    .json()
    .catch(() => ({}));
  if (typeof title !== "string" || !title.trim() || title.length > 100) {
    return NextResponse.json({ error: "invalid_title" }, { status: 400 });
  }

  // 이미지 팝업: 우리 스토리지(popup-images) URL 만 허용. body 는 무시(null).
  // 텍스트 팝업: body 필수.
  let image: string | null = null;
  if (imageUrl != null) {
    const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/popup-images/`;
    if (typeof imageUrl !== "string" || !imageUrl.startsWith(prefix)) {
      return NextResponse.json({ error: "invalid_image" }, { status: 400 });
    }
    image = imageUrl;
  }
  if (!image && (typeof body !== "string" || !body.trim() || body.length > 2000)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const supa = getServiceSupabase();
  let target: string | null = null;
  if (targetUserId != null) {
    if (typeof targetUserId !== "string" || !UUID_RE.test(targetUserId)) {
      return NextResponse.json({ error: "invalid_target" }, { status: 400 });
    }
    const { data: u } = await supa
      .from("users")
      .select("id")
      .eq("id", targetUserId)
      .maybeSingle();
    if (!u) {
      return NextResponse.json({ error: "target_not_found" }, { status: 404 });
    }
    target = targetUserId;
  }

  const { data: popup, error } = await supa
    .from("popups")
    .insert({
      target_user_id: target,
      title: title.trim(),
      body: image ? null : (body as string).trim(),
      image_url: image,
      created_by: gate.userId,
    })
    .select("id")
    .single();
  if (error || !popup) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await logAdminAction({
    adminId: gate.userId,
    action: "popup_send",
    targetType: "popup",
    targetId: popup.id,
    payload: {
      title: title.trim(),
      broadcast: target === null,
      targetUserId: target,
      hasImage: image !== null,
    },
  });

  return NextResponse.json({ id: popup.id });
}
