// 상품 설명 페이지 히어로 — 그림 카드 + 제목·훅·칩·CTA. 서버 컴포넌트(CTA 만 클라 섬).
//
// 카드 형태는 홈 캐러셀(HeroCarousel)과 같은 언어다: full-bleed 일러스트를 rounded 카드에
// object-cover 로 채운다. 다만 캐러셀처럼 그림 위에 제목을 얹지 않고 **카드 밖 아래**에 둔다
// (배치 B) — 상품명·후킹이 큰 글씨로 읽혀야 하는 지면이라서.
import Image from "next/image";
import Link from "next/link";
import LandingCta from "./LandingCta";

export default function FortuneLandingHero({
  title,
  hook,
  cardSrc,
  chips,
  ctaLabel,
  ctaHref = "#buy",
  trackType,
}: {
  title: string;
  hook: string;
  /** 카드 배너(4:3 원본을 16:10 으로 crop). 없으면 카드 없이 제목부터. */
  cardSrc: string | null;
  chips: string[];
  ctaLabel: string;
  ctaHref?: string;
  /** 계측용 상품 키 — fortune_landing_cta_clicked 의 meta.type */
  trackType: string;
}) {
  return (
    <header className="w-full">
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

      {cardSrc && (
        <div className="w-full max-w-md mx-auto px-5 mt-2.5">
          <div className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden">
            <Image
              src={cardSrc}
              alt=""
              fill
              sizes="(max-width: 448px) 100vw, 448px"
              className="object-cover"
              priority
            />
          </div>
        </div>
      )}

      <div className="w-full max-w-md mx-auto px-5 mt-4 flex flex-col items-center">
        <h1 className="font-display text-[22px] text-eye-purple text-center tracking-wide leading-snug">
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
