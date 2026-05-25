// 현재 세션 + (로그인 시) 유저 프로필. AuthBootstrap 이 진입 시 호출.

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { isAdminUserId } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, anonymousId, isAuthenticated } = await getSession();

  if (!isAuthenticated || !userId) {
    return NextResponse.json({
      user: null,
      anonymousId,
      isAuthenticated: false,
      isAdmin: false,
    });
  }

  const supabase = getServiceSupabase();
  const { data: row } = await supabase
    .from("users")
    .select("id, kakao_id, nickname, profile_img")
    .eq("id", userId)
    .single();

  if (!row) {
    // 쿠키엔 user_id 있는데 DB 에 없는 케이스 (탈퇴 등) → 게스트로 강등
    return NextResponse.json({
      user: null,
      anonymousId,
      isAuthenticated: false,
      isAdmin: false,
    });
  }

  return NextResponse.json({
    user: {
      id: row.id,
      nickname: row.nickname,
      profile_img: row.profile_img,
      provider: "kakao",
    },
    anonymousId,
    isAuthenticated: true,
    isAdmin: isAdminUserId(row.id),
  });
}
