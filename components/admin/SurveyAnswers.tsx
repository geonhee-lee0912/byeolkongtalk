// components/admin/SurveyAnswers.tsx — 설문 응답 1건의 문항-답 목록. /admin/survey 와 대시보드 인박스가 공유한다.
export function SurveyAnswers({ answers }: { answers: unknown }) {
  // answers 는 JSONB — 앱 경로(validateSurveyAnswers)로는 malformed 가 불가능하지만
  // 운영자가 SQL Editor 로 prod 데이터를 직접 편집할 수 있어(AGENTS.md) 원소 형태를
  // 신뢰하지 않는다. 배열이 아니거나 {q,a} 형태가 아닌 원소는 죽지 않고 건너뛴다.
  const list = (Array.isArray(answers) ? answers : []).filter(
    (qa): qa is { q: string; a: string } => !!qa && typeof qa.q === "string" && typeof qa.a === "string",
  );
  return (
    <div className="space-y-2.5">
      {list.map((qa, i) => (
        <div key={i}>
          <div className="text-[12px] font-bold text-white/70">{qa.q}</div>
          <div className="text-[13px] text-white/90 whitespace-pre-wrap break-words [overflow-wrap:anywhere] mt-0.5">{qa.a}</div>
        </div>
      ))}
    </div>
  );
}
