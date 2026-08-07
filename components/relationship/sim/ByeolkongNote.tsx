// components/relationship/sim/ByeolkongNote.tsx — 별콩이 금색 노트 카드(FE5). 대사 버블이 아니라 프레임 고지·코칭 노트 공용.
export default function ByeolkongNote({
  text,
  kind = "note",
  streaming,
}: {
  text: string;
  kind?: "frame" | "note";
  streaming?: boolean;
}) {
  return (
    <div className="self-stretch rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 animate-fade-in">
      <div className="flex items-center gap-1.5 mb-1 text-gold-soft text-[12px] font-bold">
        <span>🌙</span>
        <span>{kind === "frame" ? "별콩이" : "별콩이 노트"}</span>
      </div>
      <p className="text-cream-warm/95 text-[14px] leading-relaxed whitespace-pre-wrap">
        {text}
        {streaming && (
          <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-gold-soft/70 animate-pulse-soft" />
        )}
      </p>
    </div>
  );
}
