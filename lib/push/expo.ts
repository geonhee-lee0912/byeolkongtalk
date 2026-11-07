// Expo Push API 호출 — 발송(티켓)과 영수증 조회. 네트워크는 f 로 바꿔 끼울 수 있다(시험용).
export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: { path: string; kind: string; sendId: number };
  sound: "default";
  channelId: "info";
};

export type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

export type ExpoReceipt = { status: "ok" | "error"; details?: { error?: string } };

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const SEND_CHUNK = 100;
const RECEIPT_CHUNK = 1000;

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  if (process.env.EXPO_ACCESS_TOKEN) h.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  return h;
}

async function post(url: string, body: unknown, f: typeof fetch): Promise<{ data?: unknown; errors?: unknown[] }> {
  const res = await f(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const json = (await res.json().catch(() => null)) as { data?: unknown; errors?: unknown[] } | null;
  if (!res.ok || !json || (Array.isArray(json.errors) && json.errors.length > 0)) {
    throw new Error(`expo ${url} failed: ${res.status} ${JSON.stringify(json?.errors ?? null)}`);
  }
  return json;
}

/** 100개씩 나눠 보내고 요청 순서대로 티켓을 이어 붙인다. 한 묶음이라도 통째로 실패하면 던진다. */
export async function sendExpo(msgs: ExpoMessage[], f: typeof fetch = fetch): Promise<ExpoTicket[]> {
  const out: ExpoTicket[] = [];
  for (let i = 0; i < msgs.length; i += SEND_CHUNK) {
    const chunk = msgs.slice(i, i + SEND_CHUNK);
    const json = await post(SEND_URL, chunk, f);
    const data = json.data;
    if (!Array.isArray(data) || data.length !== chunk.length) {
      throw new Error(`expo send: ticket count mismatch (${Array.isArray(data) ? data.length : "none"} for ${chunk.length})`);
    }
    out.push(...(data as ExpoTicket[]));
  }
  return out;
}

export async function getReceipts(ids: string[], f: typeof fetch = fetch): Promise<Record<string, ExpoReceipt>> {
  const out: Record<string, ExpoReceipt> = {};
  for (let i = 0; i < ids.length; i += RECEIPT_CHUNK) {
    const json = await post(RECEIPTS_URL, { ids: ids.slice(i, i + RECEIPT_CHUNK) }, f);
    Object.assign(out, (json.data ?? {}) as Record<string, ExpoReceipt>);
  }
  return out;
}
