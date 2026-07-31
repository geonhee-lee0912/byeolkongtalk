import { notFound } from "next/navigation";
import { FORTUNE_CONFIG, TAROT_POSITIONS, type FortuneType } from "@/lib/fortune/types";
import TarotInput from "@/components/fortune/tarot/TarotInput";
import { noindexMetadata } from "@/lib/seo/metadata";

const TAROT_TYPES = Object.keys(TAROT_POSITIONS);

// robots·canonical 은 app/fortune/layout.tsx 에서 상속 — 여기선 문구만 덮어쓴다.
// 유효하지 않은 type 은 아래에서 notFound() 라 폴백 문구는 not-found 화면용이다.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  const cfg = TAROT_TYPES.includes(type)
    ? FORTUNE_CONFIG[type as FortuneType]
    : null;
  return noindexMetadata({
    title: cfg?.label ?? "타로 운세",
    description: cfg?.tagline ?? "별콩이가 카드로 지금 흐름을 짚어줄게.",
  });
}

export default async function TarotFortunePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  if (!TAROT_TYPES.includes(type)) notFound();
  const cfg = FORTUNE_CONFIG[type as FortuneType];
  if (!cfg || cfg.base !== "tarot" || !cfg.active) notFound();
  return <TarotInput type={type as FortuneType} />;
}
