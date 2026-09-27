"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import FortunePurchasePanel from "@/components/fortune/FortunePurchasePanel";
import { FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";

export default function FortuneInputPage() {
  const router = useRouter();
  const params = useParams<{ type: string }>();
  const type = params.type as FortuneType;
  const cfg = type in FORTUNE_CONFIG ? FORTUNE_CONFIG[type] : null;
  const valid = !!cfg && cfg.active && cfg.base === "saju" && cfg.type !== "daily";

  useEffect(() => {
    if (!valid) router.replace("/fortune");
  }, [valid, router]);

  if (!valid) return null;
  return <FortunePurchasePanel type={type} />;
}
