import Link from "next/link";
import BusinessInfo from "./BusinessInfo";

// 앱에서는 숨긴다(web-only) — 약관·사업자 정보는 마이 > 약관·사업자 정보(/mypage/legal). 스펙 2026-11-07-앱-화면 §9
export default function Footer() {
  // 판 없이 위 가는 선만 · 링크 먼저(개인정보처리방침 굵게) · 사업자 정보 묶어서 — 디자인 다듬기 ② 홈 푸터 운영자 A안(11-12)
  return (
    <footer className="web-only w-full mt-auto -mb-20">
      <div className="max-w-md mx-auto px-5 pt-6 pb-24 border-t border-lilac-mid/40">
        {/* 콘텐츠 존 진입 — 🔴 SEO 상 이 링크가 존재 이유다.
            /guide 이하 30개 URL 은 sitemap 에만 있고 **사이트 어디에서도 링크되지 않아**
            서치콘솔이 31개 중 4개만 색인했다(사유 `Discovered – currently not indexed`
            = 크롤조차 안 함). sitemap 은 크롤 신호 중 가장 약해서 저권위 신규 도메인에선
            통째로 대기열에 갇힌다. /guide 가 크롤되면 그 아래로 링크가 흐른다.
            ⚠️ Footer 는 홈과 마이페이지에서만 렌더되고 마이페이지는 로그인 게이트 뒤라,
            크롤러가 보는 건 사실상 **홈 한 곳**이다. 그래도 홈이 최고 권위 페이지다. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-12 text-eye-purple">
          <Link href="/guide" className="hover:underline">타로 가이드</Link>
          <Link href="/terms" className="hover:underline">이용약관</Link>
          <Link href="/privacy" className="font-bold hover:underline">개인정보처리방침</Link>
          <Link href="/refund" className="hover:underline">환불정책</Link>
        </div>

        <div className="mt-3.5">
          <BusinessInfo />
        </div>

        {/* design-allow: © 는 이모지가 아니라 저작권 글자(Noto 로 그려진다) */}
        <p className="text-11 text-text-faint mt-3">© 2026 별콩톡</p>
      </div>
    </footer>
  );
}
