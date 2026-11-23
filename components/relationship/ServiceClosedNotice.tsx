// 우리 사이(연애 상담)·연애 시뮬레이션 종료 안내 — `/relationship`·`/relationship/sim` 이 함께 쓴다.
// 2026-11-21 운영자 결정으로 두 서비스를 닫았다. 비로그인·로그인 같은 화면. 데이터는 DB 에 그대로 있다.
import Image from "next/image";
import Link from "next/link";

export default function ServiceClosedNotice() {
  return (
    <main className="flex flex-1 flex-col items-center py-12 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 flex flex-col items-center text-center">
        <Image
          src="/byeolkong-listen.png"
          alt="별콩이"
          width={120}
          height={120}
          className="object-contain"
          priority
        />
        <h1 className="mt-4 text-20 font-bold text-eye-purple">연애 상담은 종료됐어</h1>
        <p className="mt-3 text-14 text-text-light leading-relaxed break-keep text-balance">
          별콩이랑 이어 가던 연애 상담과 연애 시뮬레이션은 이제 문을 닫았어.
          그동안 들려준 이야기 고마워. 마음이 복잡한 날엔 타로톡이나 사주 운세에서 다시 만나자.
        </p>
        <div className="mt-8 w-full flex flex-col gap-2.5">
          <Link href="/" className="btn btn-primary btn-lg">
            홈으로
          </Link>
          <Link href="/readings" className="btn btn-secondary btn-lg">
            보관함으로
          </Link>
        </div>
      </div>
    </main>
  );
}
