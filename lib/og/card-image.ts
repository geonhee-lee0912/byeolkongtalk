// 타로 카드 webp → base64 dataURL 변환 헬퍼 — Satori(next/og ImageResponse)가 webp <img> 를
// 안정적으로 지원하지 않아 sharp 로 jpeg 변환해 넣는다.
// 타로 리딩 OG(`app/api/og/tarot/[readingId]/route.tsx`) + 오늘의 타로 OG(`app/api/og/byeolmaru/tarot/route.tsx`)
// 양쪽에서 재사용 — 로직 중복 금지.
import sharp from "sharp";

const cardImgCache = new Map<number, string>();

export async function getCardImageDataUrl(
  cardId: number,
  baseUrl: string,
  width = 320
): Promise<string | null> {
  if (cardImgCache.has(cardId)) return cardImgCache.get(cardId)!;
  try {
    const url = `${baseUrl}/cards-webp/${String(cardId).padStart(2, "0")}.webp`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`card fetch ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const resized = await sharp(buf)
      .resize(width, null, { fit: "inside" })
      .jpeg({ quality: 82 })
      .toBuffer();
    const dataUrl = `data:image/jpeg;base64,${resized.toString("base64")}`;
    cardImgCache.set(cardId, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}
