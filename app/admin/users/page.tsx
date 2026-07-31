// app/admin/users/page.tsx — 사용자 목록.
import Link from "next/link";
import { createHash } from "crypto";
import { getServiceSupabase } from "@/lib/supabase";
import { fortuneTypeFromTag } from "@/lib/fortune/types";
import { Pager } from "@/components/admin/Pager";
import LoadFailed from "@/components/admin/LoadFailed";

const PER_PAGE = 25;

export const dynamic = "force-dynamic";

export default async function AdminUsers({
  searchParams,
}: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const offset = (page - 1) * PER_PAGE;
  const supabase = getServiceSupabase();
  let query = supabase.from("users")
    .select("id, nickname, profile_img, created_at, kakao_id", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PER_PAGE - 1);
  if (q) {
    const escaped = q.replace(/[%_]/g, "\\$&");
    query = query.ilike("nickname", `%${escaped}%`);
  }
  // 🔴 목록 조회 실패를 빈 표로 위장하지 않는다 — "검색 결과 없음"과 "쿼리가 죽었다"가
  //    화면에서 같아 보이면 운영자가 그 빈 표를 믿고 판단한다(2026-07-28 cap 사고와 같은 뿌리).
  const { data: users, count, error: usersError } = await query;
  const usersFailed = !!usersError;
  // 실패 시 페이저는 숨긴다 — count 가 없는데 1/1 을 그리면 그것도 거짓말이다.
  const totalPages = usersFailed ? 0 : Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));
  const makeHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  const ids = (users ?? []).map((u) => u.id);

  // 집계 쿼리 — ids가 빈 배열이면 스킵
  type PayRow = { user_id: string; amount_won: number; status: string };
  type ReadRow = { user_id: string; consultation_type: string; emotion_tag: string | null; relationship_id: string | null; skill_key: string | null };
  type PassRow = { user_id: string };

  let payRows: PayRow[] = [];
  let readRows: ReadRow[] = [];
  let passRows: PassRow[] = [];
  const hasRelationship = new Set<string>();
  // 보강 조회는 실패해도 목록 자체는 살린다. 대신 실패한 칼럼은 0 이 아니라 "—" 로 —
  // 조회가 죽은 걸 "이 유저는 0원 결제"로 읽으면 그게 곧 오판이다.
  let payFailed = false;
  let readFailed = false;
  let passFailed = false;
  let relFailed = false;
  if (ids.length > 0) {
    const [payRes, readRes, passRes, relRes] = await Promise.all([
      supabase.from("payments").select("user_id, amount_won, status").in("user_id", ids).eq("status", "completed"),
      supabase.from("readings").select("user_id, consultation_type, emotion_tag, relationship_id, skill_key").in("user_id", ids),
      supabase.from("relationship_passes").select("user_id").in("user_id", ids),
      supabase.from("relationships").select("user_id").in("user_id", ids),
    ]);
    payFailed = !!payRes.error;
    readFailed = !!readRes.error;
    passFailed = !!passRes.error;
    relFailed = !!relRes.error;
    payRows = (payRes.data ?? []) as PayRow[];
    readRows = (readRes.data ?? []) as ReadRow[];
    passRows = (passRes.data ?? []) as PassRow[];
    for (const r of relRes.data ?? []) hasRelationship.add(r.user_id as string);
  }

  // 결제 집계
  const payMap = new Map<string, { count: number; total: number }>();
  for (const r of payRows) {
    const cur = payMap.get(r.user_id) ?? { count: 0, total: 0 };
    payMap.set(r.user_id, { count: cur.count + 1, total: cur.total + r.amount_won });
  }

  // 리딩 집계 — 고민톡/운세사주 + 연애 상담(스킬)은 별도 버킷 (스레드 본체·verdict는 카운트 제외)
  const readMap = new Map<string, { gomintalk: number; fortuneSaju: number; relSkill: number }>();
  for (const r of readRows) {
    const cur = readMap.get(r.user_id) ?? { gomintalk: 0, fortuneSaju: 0, relSkill: 0 };
    if (r.relationship_id || r.consultation_type === "relationship") {
      if (r.skill_key) cur.relSkill += 1;
    } else {
      const ft = fortuneTypeFromTag(r.emotion_tag);
      if (ft === null) cur.gomintalk += 1;
      else if (r.consultation_type !== "tarot") cur.fortuneSaju += 1;
    }
    readMap.set(r.user_id, cur);
  }

  // 연애 상담 패스 구매 집계
  const passCountMap = new Map<string, number>();
  for (const r of passRows) passCountMap.set(r.user_id, (passCountMap.get(r.user_id) ?? 0) + 1);

  // 재가입 판별 — account_withdrawals(탈퇴 원장)에 이 유저의 kakao 해시가 있으면 과거 탈퇴 이력
  const hashByUser = new Map<string, string>();
  const withdrawalHashes: string[] = [];
  for (const u of users ?? []) {
    if (u.kakao_id) {
      const h = createHash("sha256").update(String(u.kakao_id)).digest("hex");
      hashByUser.set(u.id, h);
      withdrawalHashes.push(h);
    }
  }
  const rejoinedHashes = new Set<string>();
  let withdrawalFailed = false;
  if (withdrawalHashes.length > 0) {
    const { data: wd, error: wdError } = await supabase
      .from("account_withdrawals")
      .select("kakao_id_hash")
      .in("kakao_id_hash", withdrawalHashes);
    withdrawalFailed = !!wdError;
    for (const r of wd ?? []) rejoinedHashes.add(r.kakao_id_hash as string);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        사용자 <span className="text-white/40 text-sm font-normal">
          {usersFailed ? "전체 —" : `전체 ${(count ?? 0).toLocaleString()}명`}
        </span>
      </h1>
      <form className="flex gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="닉네임 검색"
          className="bg-white/10 rounded px-3 py-2 text-sm" />
        <button className="bg-lilac-deep px-3 py-2 rounded text-sm">검색</button>
      </form>
      {/* 보강 조회 실패 — 목록은 그대로 그리되, 어느 칼럼이 못 믿을 값인지 여기서 밝힌다 */}
      {payFailed && <LoadFailed block="결제 집계(payments)" />}
      {readFailed && <LoadFailed block="리딩 집계(readings)" />}
      {passFailed && <LoadFailed block="연애 패스 집계(relationship_passes)" />}
      {relFailed && <LoadFailed block="관계 등록 여부(relationships)" />}
      {withdrawalFailed && <LoadFailed block="재가입 이력(account_withdrawals) — 재가입 배지가 안 붙는다" />}
      {usersFailed ? (
        <LoadFailed block="사용자 목록(users)" />
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="text-white/50 text-left">
            <tr>
              <th className="py-2 pr-3">프로필</th>
              <th className="pr-3">닉네임</th>
              <th className="pr-3">결제횟수</th>
              <th className="pr-3">평균결제</th>
              <th className="pr-3">누적결제</th>
              <th className="pr-3">고민톡</th>
              <th className="pr-3">연애상담</th>
              <th className="pr-3">운세사주</th>
              <th className="pr-3">가입일</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => {
              const pay = payMap.get(u.id) ?? { count: 0, total: 0 };
              const avg = pay.count > 0 ? Math.round(pay.total / pay.count) : 0;
              const read = readMap.get(u.id) ?? { gomintalk: 0, fortuneSaju: 0, relSkill: 0 };
              const passCount = passCountMap.get(u.id) ?? 0;
              return (
                <tr key={u.id} className="border-t border-white/10">
                  <td className="py-2 pr-3">
                    {u.profile_img
                      ? <img src={u.profile_img} alt="" className="w-7 h-7 rounded-full object-cover" />
                      : <div className="w-7 h-7 rounded-full bg-white/20" />}
                  </td>
                  <td className="pr-3">
                    {u.nickname ?? "(없음)"}
                    {hashByUser.has(u.id) && rejoinedHashes.has(hashByUser.get(u.id)!) && (
                      <span className="ml-1.5 inline-block text-[10px] font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded">재가입</span>
                    )}
                  </td>
                  <td className="pr-3">{payFailed ? "—" : pay.count.toLocaleString()}</td>
                  <td className="pr-3">{payFailed ? "—" : `${avg.toLocaleString()}원`}</td>
                  <td className="pr-3">{payFailed ? "—" : `${pay.total.toLocaleString()}원`}</td>
                  <td className="pr-3">{readFailed ? "—" : read.gomintalk.toLocaleString()}</td>
                  <td className="pr-3">
                    {relFailed
                      ? "—"
                      : !hasRelationship.has(u.id)
                        ? <span className="text-white/30">-</span>
                        : <>{passFailed ? "—" : passCount} <span className="text-white/40">({readFailed ? "—" : read.relSkill})</span></>}
                  </td>
                  <td className="pr-3">{readFailed ? "—" : read.fortuneSaju.toLocaleString()}</td>
                  <td className="pr-3">{new Date(u.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
                  <td className="text-right">
                    <Link href={`/admin/users/${u.id}`} className="text-lilac underline">상세</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      <Pager page={page} totalPages={totalPages} makeHref={makeHref} />
    </div>
  );
}
