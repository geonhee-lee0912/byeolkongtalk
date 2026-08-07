// components/relationship/sim/SimBubble.tsx — 인형(상대) 대사 버블(FE5). 별콩이 각인 없음 — ByeolkongNote 와 구분.
export default function SimBubble({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="max-w-[82%] self-start rounded-2xl rounded-tl-sm bg-lilac-soft/90 text-eye-purple px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
      {content}
      {streaming && (
        <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-eye-purple/60 animate-pulse-soft" />
      )}
    </div>
  );
}
