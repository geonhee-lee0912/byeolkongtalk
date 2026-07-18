// qa/client.ts — 테스트 유저 쿠키를 박은 fetch 래퍼.
import { config } from "./config.ts";

function cookieHeader(): string {
  return `byeolkong_user_id=${config.TEST_USER_ID}`;
}

export interface ChatResponse {
  text: string;
  headers: Record<string, string>;
  status: number;
}

/** JSON POST (readings 생성 등). 응답 JSON 반환. */
export async function postJson<T = unknown>(
  path: string,
  body: unknown
): Promise<{ status: number; json: T }> {
  const res = await fetch(`${config.BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, json };
}

/** chat POST — plain text 스트림을 전부 모아 텍스트 + 헤더 반환. */
export async function postChat(
  path: string,
  body: { readingId: string; messages: { role: "user" | "assistant"; content: string }[]; forceEnd?: boolean }
): Promise<ChatResponse> {
  const res = await fetch(`${config.BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
    body: JSON.stringify(body),
  });
  const text = await res.text(); // 스트림 완료까지 소비
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v)); // 키는 소문자
  return { text, headers, status: res.status };
}

/** 관계 스레드 chat POST — 단발 message(서버가 히스토리 관리). plain text 스트림 소비.
 *  postChat 과 body 계약이 다름: {relationshipId, message}. 402/404 는 JSON 이 text 로 옴. */
export async function postRelChat(
  path: string,
  body: { relationshipId: string; message: string }
): Promise<ChatResponse> {
  const res = await fetch(`${config.BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  return { text, headers, status: res.status };
}
