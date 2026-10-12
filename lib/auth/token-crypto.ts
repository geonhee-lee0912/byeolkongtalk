// 애플 리프레시 토큰 암호화(AES-256-GCM) — 탈퇴 때 애플 revoke 에 필요해서 보관하지만 원문으로 두지 않는다.
// 키 = APPLE_TOKEN_ENC_KEY(32바이트 base64). 형식: "v1:" + base64(iv 12 | tag 16 | 암호문)
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyFrom(raw: string | undefined): Buffer {
  if (!raw) throw new Error("APPLE_TOKEN_ENC_KEY not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("APPLE_TOKEN_ENC_KEY must be 32 bytes (base64)");
  return key;
}

export function encryptSecret(plain: string, rawKey: string | undefined = process.env.APPLE_TOKEN_ENC_KEY): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(rawKey), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${Buffer.concat([iv, tag, enc]).toString("base64")}`;
}

export function decryptSecret(blob: string, rawKey: string | undefined = process.env.APPLE_TOKEN_ENC_KEY): string {
  if (!blob.startsWith("v1:")) throw new Error("unknown secret format");
  const buf = Buffer.from(blob.slice(3), "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  // 태그는 16바이트로 고정한다 — 짧은(잘린) 태그를 받아들이지 않게(Node DEP0182)
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(rawKey), iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
