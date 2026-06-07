import { notFound } from "next/navigation";
import { FORTUNE_CONFIG, TAROT_POSITIONS, type FortuneType } from "@/lib/fortune/types";
import TarotInput from "@/components/fortune/tarot/TarotInput";

const TAROT_TYPES = Object.keys(TAROT_POSITIONS);

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
