# 광고비 API 자동 수집 — 설계

- 날짜: 2026-10-10
- 범위: 로드맵 ④ 어드민 총 개선의 **A 덩어리**(광고비 자동화). B(대시보드 재구성)는 별도 스펙.
- 상태: 사용자 승인(2026-10-10) — 수집 시점 = 매일 자동 + 수동 버튼 / 과거 = 전체 재수집 / CSV 업로드 제거 / 0원 행 남기기

## 1. 왜

- `ad_spend` 는 지금 **100% 수동**(폼 `AdSpendForm` · CSV `AdSpendUpload` → `/api/admin/ads/import`). Meta 쪽 연동은 CAPI(이벤트 전송) 뿐이고 지출을 읽어오는 경로가 없다. cron 도 리포 전체에 0개.
- 수동 입력 지연은 이미 대시보드를 한 번 오판시켰다 — 마지막 입력 09-19 상태에서 7일 기여가 밴드 P90 의 5배("역대급 흑자")로 떴다(`20260921010000_admin_layer1_pnl.sql` 의 `ad_rows` 주석).
- **CSV 경로가 데이터를 오염시키고 있다 (2026-10-10 prod 실측, 추정 — 광고 관리자 대조 전)**
  - `adset` 칸 값이 `10000`·`5000` = 세트 **이름이 아니라 예산**으로 보인다. 가져오기의 `findCol(headers, "ad set", "광고 세트")` 가 "광고 세트 예산" 헤더를 먼저 집는 것으로 추정.
  - 그래서 예산이 바뀌면 같은 광고가 다른 키로 갈라진다 → 10-04 `bm_v1`·`saju_v1` 이 세트 `5000`(10-04 08:12 업로드 = 그날 일부분)과 `10000`(10-05 업로드 = 하루치) **두 행 공존** ≈ ₩3,500 이중 집계 의심.
  - `campaign` 은 전 행 빈 문자열, `clicks` 는 항상 0.
  - 진행 중인 날도 일부 금액으로 박힌다(10-09 행 = 09:28 업로드).
- **API 실조회로 확정 (2026-10-10, 토큰 `ads_read`·Graph v23.0·계정 TZ Asia/Seoul·KRW)** — 최근 7일 날짜 합계 prod 대비:
  - 10-03·06·07·08 **원 단위 일치**
  - 10-04 prod **+₩1,260**: `bm_v1` 세트`5000` 행 ₩1,462 는 실재하지 않는 행(실제 bm_v1 은 `lead_v1` 세트 ₩2,282 하나) = **이중 집계 확정**. 나머지는 일부분 값(saju_v1 −142, love_v3 −60). (처음 추정한 ≈₩3,500 은 과대였다)
  - 10-05 prod −₩602: saju_v1 를 20:12 에 일부분으로 넣은 채 방치
  - 10-09 prod −₩8,920: 09:28 업로드 일부분
  - 같은 광고 이름이 **서로 다른 세트에 실재**한다(10-04 `saju_v1` 이 `saju_lead_v1`·`lead_v1` 두 세트) → 키에 세트 이름이 꼭 필요하다
- 어드민 실사용(30일 page_views): `/admin` 541PV·31일 매일 / `/admin/ads` 13PV·9일. 광고비 입력이 사실상 유일한 정기 수작업.

## 2. 수집 대상

Meta Marketing API Insights, `level=ad`, `time_increment=1`.

| ad_spend 칸 | Insights 필드 | 비고 |
|---|---|---|
| `spend_date` | `date_start` | 광고 계정 TZ = KST → 변환 없음 |
| `platform` | — | `'meta'` 고정 |
| `campaign` | `campaign_name` | |
| `adset` | `adset_name` | 예산 아님 |
| `creative_key` | `ad_name` | = utm_content 매칭 규칙 유지 |
| `spend_won` | `spend` | 문자열 → `Math.round(Number())` |
| `impressions` | `impressions` | |
| `reach` | `reach` | 일별 값(주간 빈도 산출 불가는 기존과 같음) |
| `clicks` | `inline_link_clicks` | 지금까지 0 이던 칸이 채워진다 |
| `note` | — | `'api'` (0원 행은 `'api:no_delivery'`) |
| `created_by` | — | NULL (cron) / 버튼 실행 시 어드민 id |

- 페이지네이션(`paging.next`) 끝까지 따라간다.
- **같은 키 (date, campaign, adset, ad_name) 가 둘 이상**이면 숫자 칸을 합산해 한 행으로 — 기존 UNIQUE 위반 방지. reach 는 합산(근사, 기존 CSV 와 같은 의미).

## 3. 날짜 단위 통째 교체 (핵심)

새 RPC `admin_ad_spend_replace_days(p_dates date[], p_rows jsonb)` — 한 트랜잭션에서:

1. `DELETE FROM ad_spend WHERE platform = 'meta' AND spend_date = ANY(p_dates)`
2. `p_rows` INSERT

- 그래서 예산 변경·일부분 업로드로 생긴 찌꺼기가 남지 않는다. 수동 폼으로 넣은 `platform='meta'` 행도 그 날짜가 동기화되면 덮인다(폼에 안내 문구).
- **광고가 안 나간 날 = 0원 행 1개** (`campaign=''`, `adset=''`, `creative_key=''`, `spend_won=0`, `note='api:no_delivery'`). `admin_layer1_pnl` 등이 "행 0개 = 미입력"으로 판정하므로, 이게 없으면 광고를 쉰 날마다 거짓 지연 경고가 뜬다. 소비 측 SQL·코드는 손대지 않는다.
- p_dates 는 요청 범위의 **모든 날짜**(응답에 없는 날 포함) — 응답에 없는 날이 0원 행 대상.
- 권한: `SECURITY DEFINER` + `SET search_path = public` + `REVOKE … FROM PUBLIC, anon, authenticated` 셋 다(AGENTS.md 규칙). service_role 만 EXECUTE.

## 4. 실행 경로

| 경로 | 트리거 | 범위 | 인증 |
|---|---|---|---|
| `GET /api/cron/ad-spend-sync` | Vercel Cron 매일 05:00 KST (`0 20 * * *` UTC) | 오늘 포함 최근 8일(오늘 + 7일) | `Authorization: Bearer ${CRON_SECRET}` |
| `POST /api/admin/ads/sync` (버튼 "지금 동기화") | 어드민 | 오늘 포함 최근 8일 | `requireAdminWrite` |
| 같은 라우트 + `{from, to}` (버튼 "기간 재수집") | 어드민이 날짜 지정 | 지정 기간(상한 400일) | `requireAdminWrite` + `logAdminAction` |

- 수집 로직은 `lib/ads/meta-insights.ts`(API 호출 + 행 변환, 순수 함수 분리) 하나를 세 경로가 공유.
- `vercel.json` 신설(crons 1개). Vercel Cron 은 production 배포에서만 돈다 → dev 는 버튼만.
- 오늘은 진행 중이라 일부 금액이다. 다음 실행이 교체하므로 남는 찌꺼기는 없다.

## 5. 실행 기록과 표시

새 테이블 `ad_sync_runs`(id, started_at, finished_at, trigger `'cron'|'manual'|'range'`, date_from, date_to, rows_written, ok, error). RLS ON·정책 0(기본 권한 닫힘 + 명시 REVOKE).

- `/admin/ads` 상단: **"마지막 동기화: 10-11 05:00 · 성공 · 23행"** / 실패면 빨간 줄 + 에러 요약.
- 실패 시 `logError` → `/admin/errors` 에도 남는다.
- 대시보드 1층의 광고비 지연 경고(`adSpendStaleDays`)는 그대로 둔다 — 동기화가 멈추면 같은 경고가 다시 켜지는 게 맞다.

## 6. 기존 수동 입력

- **CSV 업로드 제거**: `components/admin/AdSpendUpload.tsx` · `app/api/admin/ads/import/route.ts` 삭제, `app/admin/ads/page.tsx` 에서 빼기.
- **수동 폼 유지**: 비-Meta 광고용. "Meta 행은 그 날짜 동기화 때 API 값으로 덮인다" 안내.

## 7. 전체 재수집 절차 (prod 쓰기는 사용자 손)

1. 로컬 대조 스크립트 `scripts/ad-spend-api-diff.mjs`: Meta API(기간 = prod `ad_spend` 최소 spend_date ~ 어제) vs prod `ad_spend`(read-only) → **날짜별 금액 대조표**(현재 / API / 차이). 키 형식이 달라서 행 단위가 아니라 날짜 합계 단위로 본다.
2. 사용자가 표 확인. 큰 차이 날짜는 광고 관리자로 교차 확인.
3. prod 배포 후 사용자가 `/admin/ads` "기간 재수집"으로 실행.
4. 재실행한 대조 스크립트에서 차이 0 확인.

- 예전 판정 문서(specs·메모리)의 ROAS·CAC 숫자는 그 시점의 기록이라 고치지 않는다. 바뀐 내역은 대조표를 `docs/superpowers/specs/` 에 findings 로 남긴다.

## 8. 준비물 (사용자)

1. Meta 비즈니스 관리자 → 비즈니스 설정 → **시스템 사용자** 추가(관리자 아님 = 직원 권한으로 충분)
2. 그 시스템 사용자에 **광고 계정 자산 할당**(권한: 광고 성과 보기)
3. 앱(기존 CAPI 용 앱 재사용 가능)에 대해 **토큰 생성** — 권한 `ads_read`, 만료 없음
4. 광고 계정 ID(`act_` 뒤 숫자)
5. 환경변수 — Vercel(Production·Preview) + 로컬 `.env.local`:
   - `META_ADS_ACCESS_TOKEN`
   - `META_AD_ACCOUNT_ID`
   - `CRON_SECRET`(임의 32자 이상, Production 만 필수)
6. 등록 후 redeploy → `/api/health` 에서 존재 확인(`lib/env.ts` `OPTIONAL_ENV` 에 3개 추가)

## 9. 검증

- **유닛**: 행 변환(합산·0원 행·이름 매핑·숫자 파싱·페이지 병합) — Insights 응답 픽스처로.
- **RPC**: 마이그레이션 적용 전 dev 에서 본문 실행 → 교체 동작(삭제 범위가 meta·해당 날짜뿐인지) 확인. 적용 후 **anon 키로 실제 HTTP 호출해 401** + `ad_sync_runs` 도 anon 401(카나리아 원칙, AGENTS.md).
- **운영**: dev 에서 "지금 동기화" → 광고 관리자 최근 7일 합계와 원 단위 대조.
- **소비 측 회귀**: 동기화 후 `/admin` 1층 기여·CAC·지연 경고, `/admin/analytics` 소재 퍼널 CAC/ROAS 가 정상 렌더.

## 10. 위험·미확인

- **삭제·보관된 광고가 Insights `level=ad` 에 포함되는지** 미확인 → 대조 스크립트의 날짜 합계가 광고 관리자와 맞는지로 판정. 빠지면 `filtering` 에 `ad.effective_status` 전 상태를 넣는다.
- 대조 결과 과거 이중 집계가 확정되면 7월~ 기여·CAC 밴드가 움직인다(의도된 변화).
- 토큰 만료·권한 회수 시 cron 이 실패 → `/admin/ads` 빨간 줄 + `/admin/errors` + 1층 지연 경고 3중으로 보인다.

## 11. 범위 밖

- 대시보드 재구성(B), 소재별 CTR·빈도 표시, Meta 외 플랫폼 API.
