import Link from "next/link";

// 별마루 서브 라우트(saju·woori) 공통 앱-헤더 — ← 별마루로 + 타이틀. 탭타겟은 -m-2 p-2 로
// 글리프보다 넓게(모바일 히트영역). 허브 자체 헤더는 뒤로가기가 없어 이 컴포넌트를 쓰지 않는다.
export default function BackHeader({ title }: { title: string }) {
  return (
    <header className="flex items-center gap-2">
      <Link href="/byeolmaru" aria-label="별마루로" className="-m-2 p-2 text-xl text-lilac-deep">←</Link>
      <h1 className="font-display text-2xl text-eye-purple">{title}</h1>
    </header>
  );
}
