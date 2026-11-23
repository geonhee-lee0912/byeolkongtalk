// 공유 그림 머리의 상품 그림(운영자 11-22 시안16 B) — 파일을 직접 읽는다(Next 문서 image-response 의 방식).
// 주소로 받지 않는 이유: dev 는 배포 보호에 막힌다. 경로를 글자 그대로 적어야 빌드가 그 파일을 함수에 싣는다.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const READ = {
  tarot: () => readFile(join(process.cwd(), "public/icons/tarot.png")),
  saju: () => readFile(join(process.cwd(), "public/icons/saju/nature.png")),
};
const cache = new Map<keyof typeof READ, string>();

/** 못 읽으면 null — 그림 없이 글자만 그린다(lib/og/card-image 와 같다) */
export async function getHeaderIconDataUrl(kind: keyof typeof READ): Promise<string | null> {
  if (cache.has(kind)) return cache.get(kind)!;
  try {
    const png = await sharp(await READ[kind]())
      .trim()
      .resize(144, 144, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
    cache.set(kind, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}
