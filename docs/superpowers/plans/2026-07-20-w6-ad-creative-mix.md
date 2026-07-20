# W6 광고 소재 믹스 구현 플랜 (사이클 3f)

> **For agentic workers:** 이 플랜은 **코드 팔로업(Phase 1)** 과 **인터랙티브 소재 제작(Phase 2)** 이 섞여 있다. Phase 1은 subagent/inline 자동 실행 가능. **Phase 2는 힉스필드 생성물 사용자 선택 게이트가 핵심이라 사용자와 함께 진행** — 자동 실행 금지. Phase 3는 사용자 액션 체크리스트.

**Goal:** 연애 중심 광고 소재 3본(대조군 유지 + 범용연애·연애상담 신규)을 제작하고, 신규 소재가 요구하는 랜딩(`/start?v=love`)·어트리뷰션 코드를 dev에 붙인다.

**Architecture:** 코드는 기존 `/start` variant 인프라 + 전역 AuthBootstrap 캡처 seam 재사용(신규 파일 없음). 소재는 힉스필드(이미지→업스케일→영상) + Figma 텍스트 조판 기존 워크플로우 재사용.

**Tech Stack:** Next.js 16 (App Router, client page), 힉스필드 MCP(nano_banana_pro / kling), Figma MCP, `ad-assets/final/` 산출.

**Spec:** `docs/superpowers/specs/2026-07-20-w6-ad-creative-mix-design.md`

**배포:** ⚠️ 전부 dev/로컬. Meta 라이브는 3e prod 일괄 이후(Phase 3). 중간 prod 금지.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `app/start/page.tsx` | 광고 랜딩 variant 스위치 | Modify — `love` variant 추가 |
| `components/auth/AuthBootstrap.tsx` | first-touch 유입 캡처 | Modify — `landing_variant` v-우선 |
| `ad-assets/final/ad_love_{feed.png,story.png,story.mp4}` | 슬롯2 범용연애 소재 | Create |
| `ad-assets/final/ad_relationship_{feed.png,story.png,story.mp4}` | 슬롯3 연애상담 소재 | Create |

`lib/emotions.ts`(LOVE_TAGS/EMOTION_OPTIONS), `lib/acquisition.ts`(ACQ_KEYS/AcqPayload), `app/relationship/page.tsx`(콜드스타트)는 **읽기만** — 수정 없음.

---

# Phase 1 — 코드 팔로업 (dev)

## Task 1: `/start?v=love` variant 추가

**Files:**
- Modify: `app/start/page.tsx:29` (VARIANTS)
- Modify: `app/start/page.tsx:32-38` (HERO_COPY)
- Modify: `app/start/page.tsx:41-44` (LOVE_VARIANT_TAG)

**근거:** `love`를 `LOVE_VARIANT_TAG`에 `"걔 속마음이 궁금해"`로 매핑하면 기존 `LoveDirectMenu`(line 415)가 자동으로 §4 요구(하이라이트 카드 "네가 보고 온 그 고민" + 나머지 연애 5종 목록 + 하단 홈 링크)를 렌더한다. 신규 컴포넌트 불필요.

- [ ] **Step 1: VARIANTS에 `love` 추가**

`app/start/page.tsx:29` 을 아래로 교체:

```tsx
const VARIANTS = ["counsel", "daily", "tarot", "reunion", "contact", "love"] as const;
```

- [ ] **Step 2: HERO_COPY에 love 카피 추가 (소재 훅과 일치)**

`app/start/page.tsx` 의 `HERO_COPY` 객체(line 32-38) 마지막 항목 뒤에 추가:

```tsx
  contact: { line1: "핸드폰만 보고 있는", line2: "너에게" },
  love: { line1: "그 사람은 지금", line2: "무슨 생각을 할까" },
};
```

- [ ] **Step 3: LOVE_VARIANT_TAG에 love → 캐치올 태그 매핑**

`app/start/page.tsx` 의 `LOVE_VARIANT_TAG`(line 41-44) 를 아래로 교체:

```tsx
/** 연애 직행 variant → 하이라이트 태그 */
const LOVE_VARIANT_TAG: Partial<Record<Variant, EmotionTag>> = {
  reunion: "재회할 수 있을까",
  contact: "언제 연락 올까, 타이밍이 궁금해",
  love: "걔 속마음이 궁금해", // 범용연애 캐치올 (의도적 모호 태그)
};
```

- [ ] **Step 4: 타입/빌드 그린 확인**

Run: `npm run build`
Expected: EXIT 0, 타입 에러 없음. (`Variant` 유니온에 `love` 자동 포함 → `HERO_COPY`/`LOVE_VARIANT_TAG` 커버리지 타입 통과)

- [ ] **Step 5: 커밋**

```bash
git add app/start/page.tsx
git commit -m "feat(3f): /start?v=love variant (범용연애 랜딩)"
```

---

## Task 2: AuthBootstrap `landing_variant` v-우선 수정

**Files:**
- Modify: `components/auth/AuthBootstrap.tsx:50-53`

**근거:** 현재 `landing_variant`를 `pathname==="/start"`에서 `utm_content`로만 세팅한다. 신규 규약에서 `utm_content`는 **소재명(ad.name)** 이므로, landing_variant에 소재명이 들어가는 데이터 오염이 생긴다. 랜딩 종류는 `v`가 정답 → `v` 우선, `utm_content`는 레거시 `/start` 폴백으로만.

- [ ] **Step 1: landing_variant 캡처 로직 교체**

`components/auth/AuthBootstrap.tsx:50-53` 의 블록:

```tsx
    if (pathname === "/start") {
      const v = sp.get("utm_content");
      if (v) payload.landing_variant = v;
    }
```

을 아래로 교체:

```tsx
    // 랜딩 종류: 전용 v 우선(어느 광고 랜딩이든), utm_content 는 레거시 /start 폴백.
    // (utm_content 는 이제 소재명 전용이라 v 없이 이걸 landing_variant 로 쓰면 오염)
    const lv = sp.get("v") ?? (pathname === "/start" ? sp.get("utm_content") : null);
    if (lv) payload.landing_variant = lv;
```

- [ ] **Step 2: 빌드 그린 확인**

Run: `npm run build`
Expected: EXIT 0.

- [ ] **Step 3: 커밋**

```bash
git add components/auth/AuthBootstrap.tsx
git commit -m "fix(3f): landing_variant v 우선 (utm_content=소재명 분리 후 오염 수정)"
```

---

## Task 3: dev 배포 + 브라우저 E2E 검증

**근거:** 페이지/effect 변경이라 유닛 테스트 대신 dev preview에서 실제 렌더 확인(프로젝트 관행 — 브라우저 E2E).

- [ ] **Step 1: dev push**

```bash
git push origin dev
```

- [ ] **Step 2: `/start?v=love` 렌더 확인**

브라우저(preview_start 또는 dev 도메인)에서 `/start?v=love&utm_content=ad_love_test` 열기.
확인:
- 히어로 = "그 사람은 지금 / 무슨 생각을 할까"
- 하이라이트 카드 "네가 보고 온 그 고민" + "걔 속마음이 궁금해" + "별콩이한테 물어보기" 버튼
- "다른 연애 고민이라면" + 나머지 연애 5종 목록
- 하단 "별콩톡 전체 보러가기 →"
- 콘솔 에러 없음

- [ ] **Step 3: 가드 확인**

`/start` (파라미터 없이) → 홈 `/` 리다이렉트.
`/start?v=love` → 위 렌더(리다이렉트 안 됨).

- [ ] **Step 4: 어트리뷰션 쿠키 확인**

`/start?v=love&utm_content=ad_love_test&utm_source=meta` 진입 후 devtools Application → Cookies → `byeolkong_acq` 값에 `"landing_variant":"love"` + `"utm_content":"ad_love_test"` 둘 다 들어있는지 확인(v가 landing_variant, utm_content는 소재명으로 분리).

---

# Phase 2 — 소재 제작 (⚠️ 사용자 인터랙티브)

> **진행 방식:** 각 슬롯 = 이미지 생성 → **사용자에게 시안 보여주고 선택** → 업스케일 → Figma 텍스트 조판 → 영상. 사용자 선택 게이트를 건너뛰지 말 것. 크레딧(현재 163) 소진 주의 — 영상 전 `mcp__higgsfield__balance` 재확인, 부족 시 `show_plans_and_credits`로 충전 안내.

**공통 규격:**
- 피드 4:5 (1080×1350) / 스토리·릴스 9:16 (1080×1920)
- 뱃지 "첫 회 무료" · 다크보라(#16122E~#4A3A82)+골드 · 별콩이 캐릭터
- 레퍼런스: `public/byeolkong-main.png`
- ⚠️ 스토리 영상 CTA는 하단 세이프존(하단 340px) 밖 — CTA를 하단에서 ~100px 이상 띄울 것.

## Task 4: 슬롯2 범용연애 — 이미지 시안 생성 + 선택

**Files:** (생성 후) `ad-assets/round2/` 또는 scratchpad에 시안, 최종 `ad-assets/final/ad_love_{feed,story}.png`

- [ ] **Step 1: 비주얼 시안 생성 (텍스트 없는 베이스)**

`mcp__higgsfield__generate_image` (nano_banana_pro, `public/byeolkong-main.png` 레퍼런스). 프롬프트 초안:

> 별콩이(흰 여우/고양이 요정 캐릭터, 라일락 구름무늬, 이마에 골드 4각 별, 골드 후광)가 펼친 타로 카드 부채 사이로 은은한 핑크·골드 하트빛이 새어 나오는 모습. 카드를 부드럽게 들여다보는 따뜻한 표정. 배경은 깊은 보라(#16122E→#4A3A82) 밤하늘 + 골드 하트 모양 파티클과 별. 신비롭고 설레는 분위기. 3D 렌더, 부드러운 질감. **텍스트 없음.** 세로 구도(캐릭터 상단 여백 = 카피 자리).

피드 4:5, 스토리 9:16 각 3~4안. (구도상 카피가 상단, 캐릭터 중앙, CTA 하단에 앉을 여백 확보)

- [ ] **Step 2: 사용자 선택 게이트**

생성 시안을 사용자에게 제시 → 피드용·스토리용 베이스 각 1안 선택받기. (선택 전 다음 단계 진행 금지)

- [ ] **Step 3: 2K 업스케일**

선택안 `mcp__higgsfield__upscale_image` 2K.

---

## Task 5: 슬롯2 — Figma 텍스트 조판 (피드+스토리)

**Files:** `ad-assets/final/ad_love_feed.png`, `ad-assets/final/ad_love_story.png`

**텍스트 레이어:**
- 뱃지: `첫 회 무료`
- 훅: `그 사람은 지금\n무슨 생각을 할까`
- 서브: `별콩이가 카드로 비춰줄게 · 첫 회 무료`
- CTA: `무료로 마음 보기`

- [ ] **Step 1: Figma 조판**

기존 조판 파일(`T2eHOB3lchmjNMf0PdMBRu` 계열) 재사용. Figma MCP 사용 시 `/figma-use` 스킬 경유. 업스케일 베이스 위에 위 텍스트 레이어 배치(기존 tarot 소재 레이아웃·폰트 매칭 — 디스플레이 Jua 폴백, 훅은 상단·CTA 하단 pill).

- [ ] **Step 2: export → 파일 저장**

피드 4:5 → `ad-assets/final/ad_love_feed.png`, 스토리 9:16 → `ad-assets/final/ad_love_story.png`.

- [ ] **Step 3: 사용자 검수 게이트**

두 정지 소재를 사용자에게 제시 → 카피 가독성·세이프존·톤 확인. 수정 요청 시 반영.

---

## Task 6: 슬롯2 — 영상 (시네마그래프)

**Files:** `ad-assets/final/ad_love_story.mp4`

- [ ] **Step 1: 크레딧 확인**

Run: `mcp__higgsfield__balance` — 영상 생성 여력 확인. 부족하면 사용자에게 충전 안내(`show_plans_and_credits`) 후 대기.

- [ ] **Step 2: 시네마그래프 생성**

선택 스토리 베이스로 `mcp__higgsfield__generate_video` (kling, 5초 무음 루프). 움직임: 하트빛 반짝임·파티클 부유·별콩이 미세 호흡 정도(과하지 않게).

- [ ] **Step 3: 텍스트 오버레이 합성 → mp4**

Figma 스토리 텍스트(Task 5)를 SVG/PNG 오버레이로 영상 위에 합성 → `ad-assets/final/ad_love_story.mp4`. ⚠️ CTA 세이프존(하단 340px 밖).

- [ ] **Step 4: 사용자 검수 게이트**

영상 재생 확인 → 승인.

---

## Task 7: 슬롯3 연애상담 — 이미지 시안 생성 + 선택

**Files:** 최종 `ad-assets/final/ad_relationship_{feed,story}.png`

- [ ] **Step 1: 비주얼 시안 생성 (텍스트 없는 베이스)**

`mcp__higgsfield__generate_image` (nano_banana_pro, `public/byeolkong-main.png` 레퍼런스). 프롬프트 초안:

> 별콩이(흰 여우/고양이 요정 캐릭터, 라일락 구름무늬, 이마 골드 별)가 작은 원목 테이블에 마주 앉아, 김이 오르는 따뜻한 찻잔을 사이에 두고 다정하게 이야기를 들어주는 장면. 포근하고 아늑한 카페 같은 공간, 은은한 조명. 배경은 깊은 보라 톤 + 골드 별빛 소품, 하트/별 은은한 데코. 친구에게 연애 상담하는 편안하고 친밀한 분위기. 3D 렌더, 따뜻한 질감. **텍스트 없음.** 세로 구도(상단·하단 카피 여백).

피드 4:5, 스토리 9:16 각 3~4안.

- [ ] **Step 2: 사용자 선택 게이트**

시안 제시 → 피드·스토리 베이스 선택.

- [ ] **Step 3: 2K 업스케일**

`mcp__higgsfield__upscale_image`.

---

## Task 8: 슬롯3 — Figma 텍스트 조판 (피드+스토리)

**Files:** `ad-assets/final/ad_relationship_feed.png`, `ad-assets/final/ad_relationship_story.png`

**텍스트 레이어:**
- 뱃지: `첫 회 무료`
- 훅: `연애 고민 털어놓을\n친구, 여기 있어`
- 서브: `매번 처음부터 말 안 해도 돼`
- CTA: `내 연애 상담사 만나기`

- [ ] **Step 1: Figma 조판** — Task 5와 동일 방식(기존 파일 재사용, 슬롯3 텍스트로).
- [ ] **Step 2: export → `ad-assets/final/ad_relationship_feed.png` / `ad_relationship_story.png`**
- [ ] **Step 3: 사용자 검수 게이트**

---

## Task 9: 슬롯3 — 영상 (시네마그래프)

**Files:** `ad-assets/final/ad_relationship_story.mp4`

- [ ] **Step 1: 크레딧 확인** (`mcp__higgsfield__balance`)
- [ ] **Step 2: 시네마그래프 생성** — 찻잔 김·조명 흔들림·별콩이 미세 끄덕임 정도.
- [ ] **Step 3: 텍스트 오버레이 합성 → `ad-assets/final/ad_relationship_story.mp4`** (CTA 세이프존)
- [ ] **Step 4: 사용자 검수 게이트**

---

## Task 10: 소재 최종 점검 + 커밋

- [ ] **Step 1: 6개 산출물 규격 확인**

`ad-assets/final/` 에 `ad_love_{feed.png,story.png,story.mp4}` + `ad_relationship_{feed.png,story.png,story.mp4}` 존재. 피드 1080×1350 / 스토리 1080×1920 규격.

- [ ] **Step 2: (선택) 자산 커밋**

`ad-assets/`는 현재 untracked(git 미추적). 기존 소재도 커밋 안 됨 → **소재 파일은 커밋하지 않고 로컬/자산 저장소 보관**(기존 관행 유지). 커밋 여부는 사용자 확인.

---

# Phase 3 — 운영 체크리스트 (사용자 액션, 3e prod 이후)

> 코드 무관. prod 배포(3e)로 `/start?v=love`·어트리뷰션이 라이브된 뒤 실행.

- [ ] **counsel 광고그룹 OFF** (Meta 대시보드)
- [ ] **daily 자연종료 관찰** (수정 안 함)
- [ ] **신규 3본 애드셋 구성** — 대조군(tarot 기존) + 범용연애(ad_love) + 연애상담(ad_relationship). 지면 수동 지정: IG 피드+릴스+스토리.
- [ ] **광고 URL 파라미터**:
  - 범용연애: `https://byeolkongtalk.com/start?v=love&utm_content={{ad.name}}&utm_term={{placement}}`
  - 연애상담: `https://byeolkongtalk.com/relationship?utm_content={{ad.name}}&utm_term={{placement}}` (+ `utm_source=meta` 등)
  - 대조군: 기존 유지
- [ ] **`ad_spend.clicks` 수기 입력 재개**
- [ ] **성공지표 관찰** (spec §6): 슬롯별 CAC/ROAS · 슬롯3 패스 구매·갱신·복귀(리텐션)

---

## Self-Review 결과

- **Spec 커버리지:** §2 소재 믹스→Phase 2, §4 랜딩→Task 1, §5 코드 팔로업→Task 1·2(§5-2 relationship은 grep 확인 결과 무코드), §6 운영→Phase 3, §7 제작·크레딧→Task 4~9. §5-3 utm_content 개별화→Phase 3. 커버 완료.
- **Placeholder:** 이미지 프롬프트·텍스트 레이어·코드 전량 명시. Figma 조판만 절차 기술(도구 특성상 인터랙티브) — 텍스트 내용은 확정.
- **타입 일관성:** `Variant` 유니온 확장이 `HERO_COPY`(Record<Variant>)·`LOVE_VARIANT_TAG`(Partial<Record<Variant>>) 커버리지 타입을 자동 강제 → Step 4 빌드로 검증.
