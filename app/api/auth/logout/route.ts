import { NextResponse } from "next/server";
import { clearUserCookie } from "@/lib/session";

export async function POST() {
  const res = NextResponse.json({ success: true });
  clearUserCookie(res);
  return res;
}
