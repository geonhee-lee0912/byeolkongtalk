import Link from "next/link";

export default function Footer() {
  return (
    <footer className="w-full mt-auto -mb-20 bg-white/[0.75] backdrop-blur-sm border-t border-lilac-soft/40">
      <div className="max-w-md mx-auto px-5 pt-6 pb-24">
        {/* 브랜딩 */}
        <div className="flex items-center gap-2.5 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/byeolkong-main.png"
            alt="별콩이"
            className="w-8 h-8 rounded-full bg-cream-warm object-cover"
          />
          <div>
            <p className="font-display text-[14px] text-eye-purple">별콩톡</p>
            <p className="text-[11px] text-text-light/80">
              네 마음을 봐주는 AI 사주·타로 친구
            </p>
          </div>
        </div>

        {/* 구분선 */}
        <div className="h-px bg-lilac-soft/40 mb-4" />

        {/* 사업자 정보 */}
        <div className="text-[11px] text-text-light/90 leading-loose space-y-0.5">
          <p>상호: 브레이브샤인</p>
          <p>대표자: 이건희</p>
          <p>사업자등록번호: 537-29-02059</p>
          <p>통신판매업신고번호: 2026-서울영등포-1106호</p>
          <p>주소: 서울특별시 영등포구 양평로 24길 9</p>
          <p>대표전화: 010-7456-6473</p>
          <p>이메일: oneulcard@gmail.com</p>
        </div>

        {/* 링크 */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-lilac-soft/30">
          <Link
            href="/terms"
            className="text-[11px] text-text-light/90 hover:text-eye-purple transition-colors"
          >
            이용약관
          </Link>
          <Link
            href="/privacy"
            className="text-[11px] text-text-light/90 hover:text-eye-purple transition-colors"
          >
            개인정보처리방침
          </Link>
          <Link
            href="/refund"
            className="text-[11px] text-text-light/90 hover:text-eye-purple transition-colors"
          >
            환불정책
          </Link>
        </div>

        <p className="text-[10px] text-text-light/60 mt-4">
          © 2026 별콩톡. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
