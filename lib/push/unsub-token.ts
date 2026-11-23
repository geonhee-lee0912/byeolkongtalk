// 광고 알림의 수신거부 표 — 로그인 없이 그 알림의 주인 계정을 철회시킨다(설계 §4-7).
// 모양: `v1.<push_sends id>.<서명>`. 서명 = HMAC-SHA256(키, "push-unsub:v1:<sendId>:<userId>") 앞 16바이트(base64url).
// 회원 id 는 표에 싣지 않는다 — 서버가 sendId 로 발송 기록을 찾아 그 회원으로 서명을 다시 만들어 맞춘다.
// 1회용은 DB(push_sends.unsubscribed_at, RPC push_set_ad_consent)가 지킨다. 키는 AUTH_TOKEN_SECRET 에서 용도 문자열로 갈라 쓴다.
import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "v1";
const SIG_BYTES = 16;
const TOKEN_RE = /^v1\.([1-9][0-9]{0,15})\.([A-Za-z0-9_-]{22})$/;

function key(secret: string): Buffer {
  return createHmac("sha256", secret).update("byeolkong:push-unsub").digest();
}

function sig(secret: string, sendId: number, userId: string): Buffer {
  return createHmac("sha256", key(secret)).update(`push-unsub:${PREFIX}:${sendId}:${userId}`).digest().subarray(0, SIG_BYTES);
}

function secretOrThrow(secret?: string): string {
  const s = secret ?? process.env.AUTH_TOKEN_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_TOKEN_SECRET missing — push unsubscribe token");
  return s;
}

export function makeUnsubToken(sendId: number, userId: string, secret?: string): string {
  return `${PREFIX}.${sendId}.${sig(secretOrThrow(secret), sendId, userId).toString("base64url")}`;
}

/** 모양만 읽는다(서명 확인 전) — 발송 기록을 찾을 sendId. 모양이 틀리면 null */
export function readUnsubToken(token: unknown): { sendId: number; sig: string } | null {
  if (typeof token !== "string") return null;
  const m = TOKEN_RE.exec(token);
  if (!m) return null;
  const sendId = Number(m[1]);
  return Number.isSafeInteger(sendId) ? { sendId, sig: m[2] } : null;
}

/** 그 발송의 주인으로 서명이 맞는지 — 상수 시간 비교 */
export function verifyUnsubToken(token: string, userId: string, secret?: string): boolean {
  const t = readUnsubToken(token);
  if (!t) return false;
  // 글자 그대로 비교한다 — 22자 base64url 의 마지막 글자는 아래 2비트가 버려져, 풀어서 비교하면 다른 글자도 같은 바이트로 통과한다
  const want = Buffer.from(sig(secretOrThrow(secret), t.sendId, userId).toString("base64url"));
  const got = Buffer.from(t.sig);
  return got.length === want.length && timingSafeEqual(got, want);
}
