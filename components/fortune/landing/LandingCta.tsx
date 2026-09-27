"use client";

// 히어로 CTA — 계측 때문에만 클라다. 히어로 자체는 서버 컴포넌트로 남는다.
import { trackUiEvent } from "@/lib/analytics/ui-events";

export default function LandingCta({
  label,
  href,
  trackType,
}: {
  label: string;
  href: string;
  trackType: string;
}) {
  return (
    <a
      href={href}
      onClick={() => trackUiEvent("fortune_landing_cta_clicked", { meta: { type: trackType } })}
      className="mt-4 block w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[14.5px] text-center active:scale-[0.98] transition"
    >
      {label}
    </a>
  );
}
