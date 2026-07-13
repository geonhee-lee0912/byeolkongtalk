// 어드민 리딩 상세 — 업셀·추천 타임라인.
// 새 트래킹 없이 기존 데이터로 도출: 제안([RECO:] 마커) → 반응(구매 트랜잭션·자식 리딩) → 미반응.
import Link from "next/link";
import { RECO_MARKER_REGEX, RECO_DISPLAY, type RecoProduct, RECO_PRODUCTS } from "@/lib/reco-utils";

interface Tx {
  source: string;
  amount: number;
  created_at: string;
}
interface ChildReading {
  id: string;
  consultation_type: string | null;
  saju_product: string | null;
  spread_type: string | null;
  continuation_mode: string | null;
  created_at: string;
}
interface Msg {
  role: "user" | "assistant";
  content: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function productLabel(p: string): string {
  return (RECO_PRODUCTS as string[]).includes(p)
    ? RECO_DISPLAY[p as RecoProduct].label
    : p;
}

export default function UpsellPanel({
  messages,
  nextReco,
  clarifierCount,
  extraTurns,
  upsellTxs,
  childReadings,
}: {
  messages: Msg[];
  nextReco: { product?: string; source?: string; hook?: string | null } | null;
  clarifierCount: number;
  extraTurns: number;
  upsellTxs: Tx[];
  childReadings: ChildReading[];
}) {
  // 제안 감지 — assistant 턴별 [RECO:] 마커
  const offers: { turn: number; product: string }[] = [];
  let asstTurn = 0;
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    asstTurn += 1;
    for (const match of m.content.matchAll(new RegExp(RECO_MARKER_REGEX.source, "gi"))) {
      offers.push({ turn: asstTurn, product: match[1].toLowerCase() });
    }
  }

  const clarifierTxs = upsellTxs.filter((t) => t.source === "clarifier");
  const extendTxs = upsellTxs.filter((t) => t.source === "extend");
  const hasEnd = messages.some((m) => m.role === "assistant" && m.content.includes("[END]"));

  const nothing =
    offers.length === 0 && !nextReco && clarifierCount === 0 && extraTurns === 0 &&
    upsellTxs.length === 0 && childReadings.length === 0;
  if (nothing) return null;

  const offered = (prefix: string) => offers.some((o) => o.product.startsWith(prefix));

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-[13px] space-y-2">
      <div className="text-xs font-bold text-white/60">업셀 · 추천 타임라인</div>

      {offers.length > 0 && (
        <div className="space-y-1">
          {offers.map((o, i) => (
            <div key={i} className="text-white/80">
              🔔 제안 <span className="text-gold">{productLabel(o.product)}</span>
              <span className="text-white/40"> — 별콩이 {o.turn}번째 턴</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {clarifierCount > 0 ? (
          <div className="text-emerald-300">
            ✅ 카드 더 뽑기 구매 ×{clarifierCount}
            {clarifierTxs.map((t, i) => (
              <span key={i} className="text-white/40"> · ⭐{Math.abs(t.amount)} {fmt(t.created_at)}</span>
            ))}
          </div>
        ) : offered("tarot:clarifier") ? (
          <div className="text-white/40">— 카드 더 뽑기: 제안됐지만 반응 없음</div>
        ) : null}

        {extraTurns > 0 ? (
          <div className="text-emerald-300">
            ✅ 대화 연장 (+{extraTurns}턴)
            {extendTxs.map((t, i) => (
              <span key={i} className="text-white/40"> · ⭐{Math.abs(t.amount)} {fmt(t.created_at)}</span>
            ))}
          </div>
        ) : offered("extend") ? (
          <div className="text-white/40">— 대화 연장: 제안됐지만 반응 없음</div>
        ) : null}

        {childReadings.length > 0 ? (
          childReadings.map((c) => (
            <div key={c.id} className="text-emerald-300">
              ✅ 이어짐 →{" "}
              <Link href={`/admin/readings/${c.id}`} className="underline text-lilac">
                {c.consultation_type}
                {c.saju_product ? `:${c.saju_product}` : c.spread_type ? `:${c.spread_type}` : ""}
              </Link>
              <span className="text-white/40">
                {" "}({c.continuation_mode ?? "?"}) {fmt(c.created_at)}
              </span>
            </div>
          ))
        ) : offers.some((o) => !o.product.startsWith("tarot:clarifier") && o.product !== "extend") || nextReco ? (
          <div className="text-white/40">— 추천/이어가기: 아직 전환 없음</div>
        ) : null}
      </div>

      {nextReco?.product && (
        <div className="text-white/60 border-t border-white/10 pt-2">
          결과 화면 추천: <span className="text-gold">{productLabel(nextReco.product)}</span>
          <span className="text-white/40"> (source: {nextReco.source})</span>
          {nextReco.hook && <div className="text-white/40 text-[12px] mt-0.5">훅: {nextReco.hook}</div>}
        </div>
      )}

      <div className="text-white/40 text-[12px]">
        대화 상태: {hasEnd ? "정상 종료 [END]" : "미종료 (진행 중이거나 이탈)"}
      </div>
    </div>
  );
}
