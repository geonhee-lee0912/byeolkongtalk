// 버튼 처리 중 표시 — 글자 대신 점 세 개(스펙 2026-11-09 §2.6). 색은 버튼 글자색을 따른다.
export default function ButtonDots() {
  return (
    <span role="status" aria-label="처리 중" className="inline-flex items-center gap-1">
      {[0, 150, 300].map((d) => (
        <span key={d} className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-soft" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}
