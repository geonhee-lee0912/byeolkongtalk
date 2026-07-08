// app/api/admin/popups/upload/route.ts — 팝업 이미지 업로드 (multipart).
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdminWrite } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function POST(req: NextRequest) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "invalid_type", allowed: Object.keys(ALLOWED) },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "too_large", maxBytes: MAX_SIZE }, { status: 400 });
  }

  const supa = getServiceSupabase();
  const path = `${randomUUID()}.${ext}`;
  const { error } = await supa.storage
    .from("popup-images")
    .upload(path, await file.arrayBuffer(), { contentType: file.type });
  if (error) {
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  const { data } = supa.storage.from("popup-images").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
