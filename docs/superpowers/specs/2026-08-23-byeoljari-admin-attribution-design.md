# 별자리(무료 서비스) 어드민 + 어트리뷰션 — 설계

- 날짜: 2026-08-23
- 상태: 설계(승인 대기)
- 관련: `star-inyeon-map-progress`(메모리) · `byeoljari-admin-plan`(메모리) · `cost-unit-economics-2026-08-10`(메모리) · `supabase-max-rows-cap`(메모리) · `specs/2026-07-28-admin-aggregation-rpc-migration.md`

## 1. 배경·목적

무료 바이럴 서비스 "별 인연 별자리 지도"(`/fortune/byeoljari`)가 dev 에 완성됐고 prod 배포 대기 중이다(`origin/main` 에 byeoljari 커밋·파일·마이그레이션 0, dev 가 166 커밋 앞섬 — 즉 **실사용 데이터가 아직 없다**).

이 서비스의 사업 목적은 ①소셜 바이럴 ②로그인 유입 ③SEO 다. 그 성과 — **생성 → 초대 → 가입 → 결제** 퍼널 — 을 `/admin` 에서 관측하는 대시보드를 만든다. 핵심 선결 과제는 **어트리뷰션**: "별자리를 접한 사람이 나중에 가입/결제까지 갔는지"를 이어붙일 키가 필요하다.

**배포 전이라는 점이 설계의 축이다.** 소급할 데이터가 없으므로, 어트리뷰션 인프라를 이 작업에 함께 심어 배포하면 배포 순간부터 first-class 로 깨끗하게 잡힌다. 지금 안 심고 배포하면 그 기간 유입은 영영 못 잡는다.

## 2. 요구사항

사용자 원문(2026-08-23):
1. "분석 성과" 하위에 "무료 서비스" 섹션 추가
2. 별자리 지도 만든 사람 + 만든 사람마다 초대한 지인 수 등 정보 수집
3. 실제 가입 인원 추적
4. 가입 인원 중 결제까지 간 사람 추적

추가 결정(2026-08-23 브레인스토밍):
- 추적 대상 = **둘 다**(링크 유입 퍼널 + 참여자 퍼널)
- 견고함 = **B. 하이브리드**(링크 utm first-class + 참여자 anon 브리지 SQL join, 멤버/맵 테이블 스키마 무변경)
- 모든 지표를 **일별 추세 / 전체 집계**로 구분
- 지도당 멤버 수 분포에 **백분위(P75=상위25%, P90=상위10%)** 추가

## 3. 어트리뷰션 설계 (B. 하이브리드)

서로 다른 두 개의 실을 잡는다.

### 3.1 링크 유입 퍼널 (first-class, utm)
- **키**: 초대 링크에 심는 `utm_source=byeoljari` + `utm_content={shareId}`.
- **경로**: 방문자가 utm 링크로 랜딩 → 기존 [AuthBootstrap](../../../components/auth/AuthBootstrap.tsx) 이 `byeolkong_acq` first-touch 쿠키에 캡처 → 신규 가입 시 [카카오 콜백](../../../app/api/auth/kakao/route.ts) 이 `user_acquisition` 에 INSERT.
- **잡히는 것**: "이 유저는 별자리 초대(어느 맵 = utm_content)로 가입했다" 가 `user_acquisition` 에 박제. 전체 획득 대시보드와 utm_source 로 대조 가능.
- **성격**: 미래분만(배포 후 utm 유입이 쌓여야 값이 남). 지금 데이터 0 이라 페널티 없음.

### 3.2 참여자(member) 퍼널 (anon 브리지, SQL join)
- **키**: `star_map_members.member_anon_id`(join 시 저장됨, [join/route.ts:94](../../../app/api/fortune/byeoljari/[shareId]/join/route.ts)).
- **브리지**: `page_views`/`ui_events` 는 한 row 에 `anon_id` + `user_id` 를 동시 기록(설계된 anon↔user 브리지). 참여자 anon 이 나중에 같은 브라우저에서 로그인하면 그 anon 을 가진 row 에 user_id 가 붙음 → `member_anon_id → page_views(user_id) → users/payments` 로 재구성.
- **잡히는 것**: "지도에 지인으로 참여한 사람이 나중에 가입/결제했나".
- **스키마 변경 없음**: 어드민 집계 RPC 의 SQL join 으로만.

### 3.3 함정 (집계에서 처리)
- ⚠️ **대리입력 오염**: 호스트 멤버의 `member_anon_id = 맵의 creator_anon_id`([route.ts:132](../../../app/api/fortune/byeoljari/route.ts)). creator 가 [shareId] 랜딩에서 지인을 대신 입력하거나 자기 링크로 자기가 join 하면 그 비호스트 멤버의 `member_anon_id` 도 creator anon 이 된다 → "외부 참여자"가 아니다. **참여자→가입 집계에서 `member_anon_id = 그 맵의 creator_anon_id` 인 멤버는 제외**한다.
- ⚠️ **다른 기기 로그인**: anon 브리지라 참여자가 다른 기기/쿠키에서 가입하면 끊긴다(기존 구조적 한계). 지표는 하한(lower bound)으로 해석 — 화면에 주석.
- ⚠️ **미래분 지표**(K-factor·별자리경유 가입): 배포 초기엔 0. 정상.

## 4. 배포 전에 심을 코드 변경 3개 (인프라)

| # | 변경 | 위치 | 상세 |
|---|---|---|---|
| a | 초대/공유 링크에 utm 부착 | [[shareId]/page.tsx](../../../app/fortune/byeoljari/[shareId]/page.tsx) 복사 버튼(+카카오 공유가 있으면 그 경로도) | 복사 URL = `${origin}/fortune/byeoljari/${shareId}?utm_source=byeoljari&utm_medium=invite&utm_content=${shareId}`. 링크 빌더는 순수 함수로 분리해 유닛 테스트. |
| b | shareId path 정규화 | [pageview.ts](../../../lib/analytics/pageview.ts) `normalizePath` | `/fortune/byeoljari/{shareId}` → `/fortune/byeoljari/:shareId`. byeoljari 전용 규칙(base62 일반 규칙은 타 라우트 오접 위험). 개별 맵 귀속은 utm_content 로, page_views 는 라우트 트래픽용으로 분리. |
| c | 초대버튼 클릭 계측 | [ui-events.ts](../../../lib/analytics/ui-events.ts) allowlist + 복사 버튼 onClick | 이벤트명 `byeoljari_invite_clicked`, meta 에 shareId(PII 아님). K-factor 분모(초대 발신 횟수). |

라벨 보강(선택, 저비용): [route-labels.ts](../../../lib/analytics/route-labels.ts) `ROUTE_LABEL` 에 `/fortune/byeoljari`·`/fortune/byeoljari/:shareId` 사람이 읽는 라벨 추가(트래픽 화면 가독성).

## 5. 지표 (4 퍼널) — 일별/전체 · 데이터 소스

날짜 버킷은 전부 KST 자정: SQL `(created_at AT TIME ZONE 'UTC' + interval '9 hours')::date`. 어드민 제외 유저 배열(`adminExclusionArray()`)을 모든 인원/전환 집계에 적용.

byeoljari path 정의(정규화 후, 두 path 를 구분해서 씀):
- **만들기** = `/fortune/byeoljari` — 생성 퍼널의 진입
- **랜딩(초대 조회)** = `/fortune/byeoljari/:shareId` — 참여 퍼널의 진입

### ① 생성 (Creation)
| 지표 | 전체 | 일별 | 소스 |
|---|---|---|---|
| 지도 생성 수 | 누적 count | 일별 count | `star_maps`(created_at KST) |
| 만들기 진입 UV | 전체 distinct anon | 일별 distinct anon | `page_views` path=`/fortune/byeoljari`(만들기만) |
| 진입→생성 전환율 | 전체 | 일별 | 만들기 진입 anon 대비 생성 anon |
| 생성자 구성(로그인/미claim 익명) | 스냅샷 비율 | — | `star_maps.owner_user_id` NULL 여부 |
| 생성자 UTM 분포 | 전체 | — | creator user ↔ `user_acquisition.utm_source` |

주: "생성 시점 로그인 여부"는 claim 후 owner 가 채워져 정밀 추적 불가 → "현재 owner 있음 vs 미claim 익명(owner NULL)" 스냅샷으로 근사(화면 주석).

### ② 초대/바이럴 (Invite/Viral)
| 지표 | 전체 | 일별 | 소스 |
|---|---|---|---|
| 랜딩(초대) 조회 UV | 전체 distinct anon | 일별 distinct anon | `page_views` path=`/fortune/byeoljari/:shareId` |
| 참여(멤버) 수 | 누적(비호스트) | 일별 신규 참여 | `star_map_members`(is_host=false) |
| **지도당 멤버 수 분포** | 평균·중앙(P50)·**P75**·**P90**·최대 | — | `percentile_cont` over member_count per map |
| 조회→참여 전환율 | 전체 | 일별 | :shareId 조회 distinct anon 대비 참여 anon |
| name_public 옵트인율 | 전체 | — | `star_map_members.name_public` |
| 초대버튼 클릭 수 | 누적 | 일별 | `ui_events` `byeoljari_invite_clicked` (4c 계측 후) |
| K-factor(맵당 데려온 신규가입) | 전체 | — | `user_acquisition` utm_content=shareId 신규 user 수 ÷ creator 수 (4a utm 후) |

백분위: `percentile_cont(0.75)` = 상위 25% 경계값, `percentile_cont(0.90)` = 상위 10% 경계값. 멤버 수 히스토그램(1 / 2–3 / 4–6 / 7–10 / 11–20 버킷)도 함께 제공(분포 직관).

### ③ 가입 (Signup)
| 지표 | 전체 | 일별 | 소스 |
|---|---|---|---|
| 별자리 경유 신규가입 | 누적 | 일별 | `user_acquisition` utm_source='byeoljari' (4a utm 후) |
| 참여자→가입 | 누적 | 일별 | member_anon_id(오염 제외) ↔ page_views(user_id) ↔ users |
| 비로그인 조회→가입 전환율 | 전체 | — | byeoljari 방문 익명 anon 중 이후 가입 |

### ④ 결제 (Payment)
| 지표 | 전체 | 일별 | 소스 |
|---|---|---|---|
| 코호트 결제자 수·결제율 vs 전체 | 전체 | — | 별자리 코호트(utm ∪ 브리지) ↔ `payments` vs 전체 결제율 |
| 코호트 매출·ARPU | 누적 매출 | 일별 매출 | `payments.amount_won` (status=completed) |
| 생성→첫결제 중앙 시간 | 중앙값 | — | creator `star_maps.created_at` → 첫 `payments.created_at` |

**보너스(후속, 이번 비목표)**: creator 재방문율(page_views) · 기여마진(`cost-unit-economics-2026-08-10` 원가 연동) · 익명 지도 claim 수(추론 난이도 높음).

## 6. 집계 RPC 설계

- 방식: **패턴 B**(서버 컴포넌트 페이지가 `getServiceSupabase()` 로 RPC 직접 호출, API 라우트 없음 — `admin_sim_summary`/`admin_slots_summary` 선례).
- 함수 분할(응집도):
  - `admin_byeoljari_creation(p_since, p_today, p_exclude)` — ① 생성(일별 추세 + 전체)
  - `admin_byeoljari_viral(p_since, p_today, p_exclude)` — ② 초대/바이럴(분포·백분위·전환)
  - `admin_byeoljari_funnel(p_since, p_today, p_exclude)` — ③ 가입 + ④ 결제 코호트
  - (분할 경계는 구현 플랜에서 SQL 복잡도 보고 1~3개로 최종 확정)
- 전부 `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`.
- 권한: **REVOKE EXECUTE FROM PUBLIC, anon, authenticated** + GRANT EXECUTE TO service_role (3종 명시).
- 🔴 마이그레이션의 **모든 함수 본문을 적용 전 prod(dev 먼저)에서 실행 검증** — 일부만 검증하면 나머지 오류로 파일 전체가 실패(`supabase-max-rows-cap` 계열 실사고).
- `.limit(100000)` 금지 — 표시용 목록이 데이터 비례로 커지면 `p_limit` + 절단 경고. (이 대시보드는 집계 위주라 대형 목록 없음.)

## 7. 화면·IA

- [AdminNav.tsx](../../../components/admin/AdminNav.tsx) `GROUPS` 에 새 그룹 `{ key:"free", label:"무료 서비스", emoji:"🎁", items:[{ href:"/admin/free/byeoljari", label:"별 인연 별자리", emoji:"✨" }] }` 추가. 인증(proxy + layout)·모바일 nav 자동 상속.
- 새 페이지 `app/admin/free/byeoljari/page.tsx`(서버 컴포넌트). 상단 = 전체 요약 카드 4퍼널, 하단 = 일별 추세 표(최근 30일, `?days=` 파라미터). 기존 어드민 화면(analytics/traffic/relationship) 시각 관례 재사용.
- 실패 표면화: RPC 별 독립 실패 → `components/admin/LoadFailed.tsx` 로 섹션 대체(숫자를 0 으로 위장 금지, `—` 표기).
- 슬러그 주의: `/admin/free` 가 기존 슬러그의 프리픽스가 아니어야 함(`AdminNav` matches 오매칭 방지) — `free` 는 신규라 안전.

## 8. 스코프 경계 / 비목표

**포함**: nav 그룹 + 화면 1개, 어트리뷰션 인프라 3변경(utm·정규화·계측), 집계 RPC(1~3), 지표 4퍼널(일별/전체·백분위).

**비목표(이번 제외)**:
- member/맵 테이블 스키마 변경(C안 user_id 컬럼) — 안 함.
- 기여마진 원가 연동 — 후속.
- 익명 claim 수 정밀 추적 — 후속.
- creator 재방문 상세 — 후속(보너스로 여유 되면).
- 다른 무료 서비스(사주향 MBTI 등) — nav 그룹만 확장 대비, 화면은 별자리 하나.

## 9. 테스트

- 링크 utm 빌더(4a) · 이벤트 상수(4c) · normalizePath byeoljari 규칙(4b) = 유닛(node:test, `node --import tsx --test`).
- RPC: 가능한 지표는 JS↔SQL 등가 검증(원본 read-only 스냅샷으로 대조, `run-prod-query.mjs` 는 service_role 함수 직접 호출 불가 → 본문 인라인 실행). `admin-time` KST 계약 준수.
- 어드민 렌더: dev 어드민에서 사용자 육안(기존 관행) + dev DB pg_proc acl `{postgres,service_role}` 만인지 확인(REVOKE 작동).

## 10. 데이터 흐름 요약

```
[초대 링크 utm]  방문 → AuthBootstrap → byeolkong_acq 쿠키 → 가입 → user_acquisition(utm_source=byeoljari, utm_content=shareId)
                                                                              ↓
[참여 member]   join → star_map_members.member_anon_id ──(page_views anon↔user 브리지)──→ users / payments
                                                                              ↓
[집계 RPC]      admin_byeoljari_* (KST, service_role) ──→ app/admin/free/byeoljari/page.tsx (패턴 B)
```
