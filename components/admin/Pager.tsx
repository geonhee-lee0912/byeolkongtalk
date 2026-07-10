// components/admin/Pager.tsx — 어드민 목록 페이지네이션 (서버 컴포넌트, 링크 기반).
import Link from "next/link";

export function Pager({
  page,
  totalPages,
  makeHref,
}: {
  page: number;
  totalPages: number;
  makeHref: (p: number) => string;
}) {
  if (totalPages <= 1) return null;
  const base = "px-3 py-1.5 rounded text-sm";
  return (
    <div className="flex items-center justify-center gap-3 pt-2">
      {page > 1 ? (
        <Link href={makeHref(page - 1)} className={`${base} bg-white/10 hover:bg-white/20`}>
          ‹ 이전
        </Link>
      ) : (
        <span className={`${base} bg-white/5 text-white/30`}>‹ 이전</span>
      )}
      <span className="text-sm text-white/60">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={makeHref(page + 1)} className={`${base} bg-white/10 hover:bg-white/20`}>
          다음 ›
        </Link>
      ) : (
        <span className={`${base} bg-white/5 text-white/30`}>다음 ›</span>
      )}
    </div>
  );
}
