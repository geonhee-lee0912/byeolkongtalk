// /fortune 하위 페이지(운세 리포트)의 히어로 배너 바로 아래에 놓는 구분선.
// 브랜드 액센트 ✦(gold)를 가운데 둔 line–star–line 모티프. 메인 진열 페이지엔 쓰지 않음.
export default function HeroDivider() {
  return (
    <div
      className="w-full max-w-md mx-auto px-8 mt-6 mb-6 flex items-center gap-3"
      aria-hidden
    >
      <div className="flex-1 h-px bg-lilac-mid/30" />
      <span className="text-gold text-[11px] leading-none">✦</span>
      <div className="flex-1 h-px bg-lilac-mid/30" />
    </div>
  );
}
