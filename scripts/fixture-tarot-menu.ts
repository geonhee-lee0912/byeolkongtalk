// scripts/fixture-tarot-menu.ts — 메뉴판 반반(A/B) dev 실화면 QA 픽스처 (LLM 0회 · dev 전용).
//   node --import tsx --env-file=.env.local scripts/fixture-tarot-menu.ts
// 만드는 것: 두 그룹 QA 유저(user_id 끝 글자로 그룹이 정해진다) + 각 그룹 '잔액 0' 유저의 끝난 맛보기 리딩 1건씩.
// 브라우저 주입: menu.localhost:3000 에서 document.cookie = "byeolkong_user_id=<id>; path=/" → location.reload()
//   (localhost 는 다른 세션과 쿠키 저장소를 공유한다 — 메모리 browser-e2e-session-injection)
import { getServiceSupabase } from "../lib/supabase.ts";
import { chargeStars, spendStars } from "../lib/stars.ts";
import { WELCOME_BONUS_STARS } from "../lib/constants.ts";
import { armForMode, type MenuArm } from "../lib/tarot/menu-ab.ts";

const DEV_REF = "vtdmxdcetziileynjaxi";

// 모두 가입 선물(웰컴 15)을 실제 가입과 같은 모양으로 받고, topUp 만큼 더 충전한 뒤 spend 만큼 쓴다
const USERS: { key: string; arm: MenuArm; id: string; kakaoId: number; nickname: string; topUp: number; spend: number }[] = [
  { key: "menu_fresh", arm: "menu", id: "44444444-4444-4444-8444-444444444440", kakaoId: -440, nickname: "메뉴QA새유저", topUp: 0, spend: 0 },
  { key: "menu_spent", arm: "menu", id: "44444444-4444-4444-8444-444444444442", kakaoId: -442, nickname: "메뉴QA잔액0", topUp: 0, spend: 15 },
  { key: "menu_rich", arm: "menu", id: "44444444-4444-4444-8444-444444444444", kakaoId: -444, nickname: "메뉴QA부자", topUp: 200, spend: 15 },
  { key: "legacy_fresh", arm: "legacy", id: "44444444-4444-4444-8444-444444444441", kakaoId: -441, nickname: "옛QA새유저", topUp: 0, spend: 0 },
  { key: "legacy_spent", arm: "legacy", id: "44444444-4444-4444-8444-444444444443", kakaoId: -443, nickname: "옛QA잔액0", topUp: 0, spend: 15 },
];

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(DEV_REF)) {
    throw new Error("dev Supabase 가 아니다 — .env.local 을 확인할 것(prod 에 돌리지 말 것)");
  }
  for (const u of USERS) {
    if (armForMode(u.id, "split") !== u.arm) throw new Error(`${u.key}: id 끝 글자가 ${u.arm} 그룹이 아니다`);
  }
  const db = getServiceSupabase();

  for (const u of USERS) {
    const { error: uErr } = await db
      .from("users")
      .upsert({ id: u.id, kakao_id: u.kakaoId, nickname: u.nickname }, { onConflict: "id" });
    if (uErr) throw new Error(`users upsert ${u.key}: ${uErr.message}`);
    // 이전 실행 흔적 정리 — 리딩(→messages CASCADE)·별 거래. spend 거래가 남아 있으면 '선물 미사용'이 깨진다
    await db.from("readings").delete().eq("user_id", u.id);
    await db.from("star_transactions").delete().eq("user_id", u.id);
    const { error: bErr } = await db
      .from("star_balances")
      .upsert({ user_id: u.id, balance: 0 }, { onConflict: "user_id" });
    if (bErr) throw new Error(`star_balances upsert ${u.key}: ${bErr.message}`);
    // 가입 선물은 실제 가입(app/api/auth/kakao)과 같은 모양으로 — '선물 미사용' 판정이 source 'welcome_bonus' 를 본다
    const welcome = await chargeStars(u.id, WELCOME_BONUS_STARS, `welcome:${u.id}`, "welcome_bonus");
    if (!welcome.success) throw new Error(`welcome ${u.key}`);
    if (u.topUp > 0) {
      const t = await chargeStars(u.id, u.topUp, `qa-topup:${u.id}`, "qa_fixture");
      if (!t.success) throw new Error(`top-up ${u.key}`);
    }
    if (u.spend > 0) {
      const r = await spendStars(u.id, u.spend, { source: "qa_fixture" });
      if (!r.success) throw new Error(`spend ${u.key}: ${r.reason}`);
    }
  }

  // 각 그룹 '잔액 0' 유저의 끝난 맛보기 리딩 — 메뉴판 쪽엔 "이어서 깊게"가 보이고 옛 쪽엔 안 보여야 한다
  const question = "걔가 요즘 답장이 늦어. 나한테 마음이 식은 걸까?";
  const readingIds: Record<string, string> = {};
  for (const u of USERS.filter((x) => x.key.endsWith("_spent"))) {
    const { data: reading, error: rErr } = await db
      .from("readings")
      .insert({
        user_id: u.id,
        profile_id: null,
        question,
        saju_data: null,
        consultation_type: "tarot",
        spread_type: "one_card",
        spread_category: "love",
        emotion_tag: "걔 속마음이 궁금해",
        drawn_cards: [{ position: 1, label: "질문의 답", card_id: 17, direction: "upright" }],
        stars_spent: u.arm === "menu" ? 15 : 10,
        has_sensitive: false,
      })
      .select("id")
      .single();
    if (rErr || !reading) throw new Error(`reading insert ${u.key}: ${rErr?.message}`);
    const { error: mErr } = await db.from("messages").insert([
      { reading_id: reading.id, role: "user", content: question },
      {
        reading_id: reading.id,
        role: "assistant",
        content: "[CARD:1]\n(QA 픽스처 풀이) 별 카드가 나왔어. 마음이 식었다기보다 지금은 조심스러운 흐름으로 보여.\n\n[END]",
      },
    ]);
    if (mErr) throw new Error(`messages insert ${u.key}: ${mErr.message}`);
    readingIds[u.key] = reading.id;
  }

  for (const u of USERS) {
    const { data: b } = await db.from("star_balances").select("balance").eq("user_id", u.id).single();
    console.log(`${u.key.padEnd(12)} ${u.arm.padEnd(6)} ${u.id}  잔액 ${b?.balance}  선물 미사용 ${u.spend === 0}`);
  }
  for (const [k, id] of Object.entries(readingIds)) {
    console.log(`${k} 맛보기 리딩: /tarot/reading?id=${id}  ·  /tarot/result?id=${id}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
