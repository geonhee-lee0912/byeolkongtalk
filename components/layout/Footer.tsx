import Link from "next/link";
import BusinessInfo from "./BusinessInfo";

// 앱에서는 숨긴다(web-only) — 약관·사업자 정보는 마이 > 약관·사업자 정보(/mypage/legal). 스펙 2026-11-07-앱-화면 §9
export default function Footer() {
  return (
    <footer className="web-only w-full mt-auto -mb-20">
      <div className="max-w-md mx-auto px-5 pt-6 pb-24 bg-white/[0.75] backdrop-blur-sm border-t border-lilac-soft/40 rounded-t-3xl">
        {/* 브랜딩 */}
        <div className="flex items-center gap-2.5 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/byeolkong-main.png"
            alt="별콩이"
            className="w-8 h-8 rounded-full bg-cream-warm object-cover"
          />
          <div>
            <p className="font-display text-14 text-eye-purple">별콩톡</p>
            <p className="text-11 text-text-light">
              네 마음을 봐주는 AI 사주·타로 친구
            </p>
          </div>
        </div>

        {/* 구분선 */}
        <div className="h-px bg-lilac-soft/40 mb-4" />

        {/* 사업자 정보 */}
        <BusinessInfo />

        {/* 콘텐츠 존 진입 — 🔴 SEO 상 이 링크가 존재 이유다.
            /guide 이하 30개 URL 은 sitemap 에만 있고 **사이트 어디에서도 링크되지 않아**
            서치콘솔이 31개 중 4개만 색인했다(사유 `Discovered – currently not indexed`
            = 크롤조차 안 함). sitemap 은 크롤 신호 중 가장 약해서 저권위 신규 도메인에선
            통째로 대기열에 갇힌다. /guide 가 크롤되면 그 아래로 링크가 흐른다.
            ⚠️ Footer 는 홈과 마이페이지에서만 렌더되고 마이페이지는 로그인 게이트 뒤라,
            크롤러가 보는 건 사실상 **홈 한 곳**이다. 그래도 홈이 최고 권위 페이지다. */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-lilac-soft/30">
          <Link
            href="/guide"
            className="text-11 text-text-light hover:text-eye-purple transition-colors"
          >
            타로 가이드
          </Link>
          <Link
            href="/terms"
            className="text-11 text-text-light hover:text-eye-purple transition-colors"
          >
            이용약관
          </Link>
          <Link
            href="/privacy"
            className="text-11 text-text-light hover:text-eye-purple transition-colors"
          >
            개인정보처리방침
          </Link>
          <Link
            href="/refund"
            className="text-11 text-text-light hover:text-eye-purple transition-colors"
          >
            환불정책
          </Link>
        </div>

        <p className="text-11 text-text-light mt-4">
          © 2026 별콩톡. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
