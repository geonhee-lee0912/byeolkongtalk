import { redirect } from "next/navigation";

// 🔴 리다이렉트 스텁 — 이 화면은 /byeolmaru/day 의 우리 탭으로 흡수됐다(2026-09-27).
//    삭제하지 않는 이유: 카카오 공유 링크가 /byeolmaru/tarot?utm_… 을 달고 오고(형제 스텁),
//    앱 밖으로 나간 주소는 되돌릴 수 없다. /select → /concern 스텁과 같은 선례다.
// 🔴 쿼리를 통째로 보존한다 — utm 이 여기서 끊기면 공유 유입이 전부 direct 로 잡힌다.
export default async function WooriTodayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") sp.set(k, v);
    else if (Array.isArray(v) && v[0] !== undefined) sp.set(k, v[0]);
  }
  sp.set("tab", "woori");
  const q = sp.toString();
  redirect(q ? `/byeolmaru/day?${q}` : "/byeolmaru/day");
}
