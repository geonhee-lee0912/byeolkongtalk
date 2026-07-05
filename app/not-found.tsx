import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-5 text-center animate-fade-in">
      <Image
        src="/byeolkong-curious.png"
        alt=""
        width={120}
        height={120}
        className="mb-4"
        aria-hidden
      />
      <h1 className="font-display text-[28px] text-eye-purple mb-2">
        별콩이도 못 찾는 길이야
      </h1>
      <p className="text-[14px] text-text-light mb-6 leading-relaxed">
        주소를 잘못 입력했거나
        <br />
        흘러간 별일 수도 있어.
      </p>

      <Link
        href="/"
        className="inline-block px-6 py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] hover:bg-lilac-deep/90 transition"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
