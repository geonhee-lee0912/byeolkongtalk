// 알림 화면들이 같이 쓰는 서버 호출(브라우저 전용). 실패는 던지지 않는다 — 화면은 다시 누르게 하거나 조용히 넘어간다.
import type { PushState } from "@/lib/app-bridge/protocol";
import type { AdStatus, AskAnswer, AskKind, AskMoment } from "@/lib/push/asks";
import type { ConsentNotice } from "./AdConsentNotice";

const JSON_HEADERS = { "Content-Type": "application/json" };

export function postAsk(moment: AskMoment, kind: AskKind, answer: AskAnswer): void {
  void fetch("/api/push/asks", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ moment, kind, answer }) }).catch(() => {});
}

/** 이 순간에 물을 것 — 비로그인·실패면 null */
export async function fetchAsk(moment: AskMoment, os: PushState): Promise<{ ask: AskKind | null; ad: AdStatus } | null> {
  try {
    const r = await fetch(`/api/push/asks?moment=${moment}&os=${os}`, { cache: "no-store" });
    if (!r.ok) return null;
    const b = (await r.json()) as { ask: AskKind | null; ad: AdStatus };
    return { ask: b.ask, ad: b.ad };
  } catch {
    return null;
  }
}

/** 광고 동의·철회 — 바뀌었으면 결과 통지를 돌려준다. 실패면 null */
export async function setAdConsent(grant: boolean, source: string): Promise<{ status: AdStatus; notice: ConsentNotice | null } | null> {
  try {
    const r = await fetch("/api/push/settings", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ ad: grant, source }) });
    if (!r.ok) return null;
    return (await r.json()) as { status: AdStatus; notice: ConsentNotice | null };
  } catch {
    return null;
  }
}
