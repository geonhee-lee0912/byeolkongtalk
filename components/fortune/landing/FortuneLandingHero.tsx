// 상품 설명 페이지 히어로 — 일러스트·제목·칩·CTA. 서버 컴포넌트(상호작용은 CTA 하나뿐이라
// 스크롤 이동을 a[href="#buy"] 로 처리한다 — 클라 번들을 늘리지 않는다).
import Image from "next/image";
import Link from "next/link";
import LandingCta from "./LandingCta";

export default function FortuneLandingHero({
  title,
  hook,
  heroSrc,
  chips,
  ctaLabel,
  ctaHref = "#buy",
  trackType,
}: {
  title: string;
  hook: string;
  heroSrc: string;
  chips: string[];
  ctaLabel: string;
  ctaHref?: string;
  /** 계측용 상품 키 — fortune_landing_cta_clicked 의 meta.type */
  trackType: string;
}) {
  return (
    <header className="w-full bg-lilac-soft/40">
      <div className="w-full max-w-md mx-auto px-5 pt-3">
        <Link
          href="/fortune"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-text-light/70 hover:text-lilac-deep transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="11.5 3 5 9 11.5 15" />
          </svg>
          <span>뒤로</span>
        </Link>
      </div>

      <div className="w-full max-w-md mx-auto px-5 pb-6 flex flex-col items-center">
        <Image src={heroSrc} alt="" width={132} height={132} priority className="drop-shadow-lg" />
        <h1 className="font-display text-[22px] text-eye-purple text-center mt-3 tracking-wide leading-snug">
          {title}
        </h1>
        <p className="text-[13px] text-text-light text-center mt-2 leading-relaxed whitespace-pre-line">
          {hook}
        </p>

        <div className="flex flex-wrap gap-1.5 justify-center mt-3">
          {chips.map((c) => (
            <span key={c} className="text-[11px] font-bold text-eye-purple bg-white/80 px-2.5 py-1 rounded-full">
              {c}
            </span>
          ))}
        </div>

        <LandingCta label={ctaLabel} href={ctaHref} trackType={trackType} />
      </div>
    </header>
  );
}
