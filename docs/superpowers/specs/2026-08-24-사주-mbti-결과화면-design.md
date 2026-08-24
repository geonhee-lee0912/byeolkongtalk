# 사주 MBTI — 플로우 + 결과화면 설계 (하위 프로젝트 D, E 흡수)

> 하위 프로젝트 **D(결과화면)** + **E(입력 플로우·퍼널·공유)** 를 함께 다룬다(아키텍처가 한 몸이라 병합). A(축매핑)·B(문항→자아+일치율)·C(콘텐츠)는 구현 완료 — D는 그 라이브러리의 **첫 UI 소비자**.
> 원 기획서 §8·§9. 작성 2026-08-24.

## 1. 목표 · 범위

무료 "사주 MBTI 테스트"의 **입력→계산→결과→공유** 전 UI. 순수 클라이언트·결정론·LLM 0·무영속(DB 0·로그인 0).

- **범위**: 진입 카드(fortune 랜딩) · 12문항 스테이지 · 생년월일 입력 스테이지 · 리빌-라스트 결과 렌더 · 오행 오각차트 · 공유(카카오·링크·stateless OG 이미지) · 공유 링크 축약 티저.
- **비범위**: 콘텐츠 텍스트(C 완료) · 축 계산(A·B 완료) · 유료 전환/재화(무료 서비스). 결과 영속·per-user DB OG(아키텍처 A로 배제).
- **의존**: `lib/saju/calc.ts`(`calcSaju`), `lib/saju-mbti/{mapping,self-type,match,content,codes,questions}.ts`, `components/saju/SajuBoard`, `lib/saju/elements`(`ELEMENT_COLORS`), `lib/kakao-share.ts`.

## 2. 확정 결정

| 결정 | 값 |
|---|---|
| 아키텍처 | **순수 클라이언트 · 무영속**. 결과는 세션 한정, 공유는 **비-PII 결과 토큰**(코드 인덱스)으로 |
| 입력 순서 | **문항(12) → 생년월일 → 결과** (완주 후 이탈 방지, 기획서 §9) |
| 결과 흐름 | **리빌-라스트**(팔자 히어로→본문→사주 원판→자아 갭 리빌), C 스펙 §6 |
| 성별 | **입력 안 함** — paljaType은 8글자 기반, 성별 무관. `calcSaju` 에 `"other"` 고정 |
| 사주 원판 위치 | 팔자 본문 뒤 · 리빌 앞("타고난 너의 증거") |
| 레이아웃 | **셸 유지**(byeoljari처럼 하단탭 유지, `/fortune` 탭 하이라이트). 몰입 아님 |
| 상태 | 단일 클라 페이지 스테이지 머신 + `sessionStorage`(새로고침 풀결과 복원) |
| 공유 링크 | 친구가 열면 **축약 티저**(팔자 유형+밴드+CTA). 상대 명식·오각 없음(무영속·PII 규칙) |

## 3. 라우팅 · 파일

- `app/fortune/saju-mbti/page.tsx` — 서버 컴포넌트. `generateMetadata({searchParams})` 가 공유 토큰으로 openGraph.images(=OG 라우트 URL) 조립. 본문은 클라 `<SajuMbtiFlow/>` 렌더.
- `components/saju-mbti/SajuMbtiFlow.tsx` — 클라 오케스트레이터(스테이지: `intro|quiz|birth|result`, 또는 `?r=` 토큰+무세션이면 `shared`).
- `components/saju-mbti/QuizStage.tsx` — 12문항 스텝퍼. `QUESTIONS` 사용, 선택지 **마운트당 1회 셔플**(위치 랜덤, 점수는 옵션 id 기준이라 안전 — B).
- `components/saju-mbti/BirthStage.tsx` — 생년월일 + 시(+모름) + 양/음력(+윤달). `components/saju/SajuInputForm` 패턴 재사용/축약. gender 미수집.
- `components/saju-mbti/ResultView.tsx` — 리빌-라스트 풀 결과(§5).
- `components/saju-mbti/SharedTeaser.tsx` — 축약 티저(§7).
- `components/saju-mbti/ElementPentagon.tsx` — 오행 오각 SVG(§6).
- `app/api/og/saju-mbti/route.tsx` — stateless OG `ImageResponse`(쿼리 토큰만, `runtime="nodejs"`, IP rate-limit, 폰트 캐시 — `app/api/og/saju/[readingId]` 패턴).
- `lib/saju-mbti/share-tokens.ts` — 결과 토큰 인코딩/디코딩/검증(§8).
- `app/fortune/page.tsx` — byeoljari식 무료 카드 1개 추가(`chip==="free"` 존, 제품 config 아님).

## 4. 플로우

`SajuMbtiFlow` 스테이지 머신(단일 페이지, 네비게이션 없음):

1. **intro** — 무엇인지 한 문장 + "시작". 기대 설정("12문항 + 생년월일로, 네가 아는 너 vs 타고난 너").
2. **quiz** — 12문항 순차. 각 문항 4선택지(셔플). 진행바. 답은 `Record<questionId, optionId>` 누적.
3. **birth** — 생년월일·시(모름 체크)·양/음력. 유효성 검사 후 "결과 보기".
4. **계산**(동기, 즉시) → **result**.
5. `?r=` 토큰 + 무세션 진입 시 → **shared** 티저.

완료 시: `sessionStorage['saju-mbti:session']` 에 `{birthInput, answers}` 저장(새로고침 복원). URL 을 `?r=<토큰>` 으로 `history.replaceState`(공유 가능). ⚠️ birth·answers 는 URL 에 **안 실림**(PII).

## 5. 결과 렌더 (리빌-라스트, 풀 — 테스터 본인)

조립:
```ts
const saju = calcSaju({ ...birth, gender: "other" });
const palja = paljaType(saju);
const self  = selfType(answers);
const match = matchRate(self.axes, palja.axes);   // ★ .axes (양쪽 다)
const content = TYPE_CONTENT[palja.code]; if (!content) return <FlowRestart/>; // 방어
```

블록(C 스펙 §6):
1. **팔자 히어로** — 낙관(`content.hanja`)·캐릭터(`content.character`)·`content.oneLiner`·`content.memeSubtitle` 칩·오행 표기(`palja.element`)·`ELEMENT_MODULE[palja.element].texture` 한 줄. night 톤.
2. **본문** — `content.personality` · `content.light`/`content.shadow`(2칸) · `content.love` · `content.compat`(fits/clashes, 코드→`TYPE_CONTENT[c].character` 로 이름 표시).
3. **사주 원판**(타고난 너의 증거) — `<SajuBoard saju={saju}/>`(4기둥) + `<ElementPentagon dist={palja.elementDist}/>`(오행 오각).
4. **리빌** — "그런데, 네가 문항에서 답한 너는—" → 자아 `TYPE_CONTENT[self.code].character` → **4축 비교**(`match.perAxis`, `agree===false` 축 강조) → 일치율 `match.matchCount`/4 + `MATCH_NARRATIVE[match.band]`(title·body) → 원칙② 톤.
5. **하단** — 공유(카카오·링크복사) · 다시하기.

⚠️ `SelfType.pct`(원점수비율) vs `PaljaType.pct`(백분위) 이중의미 — %막대 나란히 그릴 때 혼용 금지(극/일치만 신뢰). C 주석 참조.

## 6. ElementPentagon (오각 SVG, 직접 제작)

리포에 레이더 차트 없음 → 신규. **순수 기하 함수 분리**(테스트 가능):

- `pentagonGeometry(dist: Record<FiveElement,number>, size: number): { axes: {element,x,y,labelX,labelY,value}[]; polygon: string; ring: string }` — `lib/saju-mbti/pentagon.ts`.
- 5꼭지 목·화·토·금·수, 최상단 -90°에서 72° 간격. 반지름 ∝ `value / max(1, maxValue)`(최대 오행이 외곽 링). `polygon`=데이터 5점 `x,y` 문자열, `ring`=가이드 오각 외곽.
- `ElementPentagon` 은 geometry 로 `<svg>`: 가이드 링(faint lilac) + 데이터 폴리곤(soft fill·stroke) + 꼭지 점·라벨(오행+count) — 색 `ELEMENT_COLORS[el].bar`.
- 빈 dist/전부 0 방어: `value` 0 이면 중심점. `<title>`/`role="img"` 접근성.

## 7. 공유 (바이럴 루프)

- **토큰**(§8) 로 링크: `/fortune/saju-mbti?r=<token>`.
- **카카오**: `lib/kakao-share.ts` `shareToKakao({ title:"나 "+char+"래, 넌?", description:oneLiner, imageUrl:origin+"/api/og/saju-mbti?"+token, link:origin+"/fortune/saju-mbti?r="+token, buttonTitle:"나도 해보기" })`. `isKakaoReady()` 가드.
- **링크 복사**: `navigator.clipboard` + 토스트(byeoljari 패턴). Web Share API 폴백.
- **OG 이미지**(stateless, 1200×630): night 배경·낙관·캐릭터(gold, 큼)·oneLiner·밴드 라벨("N/4 · 밴드")·"별콩톡 사주 MBTI" 브랜딩. **토큰만으로 렌더**(팔자코드→content, 밴드). PII 0.
- **shared 티저**(친구): 팔자 캐릭터+낙관+oneLiner+밴드 한 줄 + "너도 해봐" 대형 CTA(→ intro). 상대 명식·오각·자아는 없음.

## 8. 결과 토큰 · 안전 (RECO 마커 크래시 교훈)

`lib/saju-mbti/share-tokens.ts`:
- `encodeResult({ paljaCode, selfCode, band, element }): string` = `${ALL_CODES.indexOf(paljaCode)}.${ALL_CODES.indexOf(selfCode)}.${BANDS.indexOf(band)}.${ELS.indexOf(element)}` (예 `"14.4.1.1"`). 인덱스라 **비-PII·짧음·한글 URL 회피**.
- `decodeResult(token): { paljaCode, selfCode, band, element } | null` — 4토막·정수·범위(0–15/0–15/0–2/0–4) **전부 검증**, 하나라도 어긋나면 `null`.
- 소비처(page metadata·OG 라우트·SharedTeaser)는 `decodeResult` 결과가 `null` 이면 렌더 안 함(→ 플로우 처음). `TYPE_CONTENT[code]`·`MATCH_NARRATIVE[band]` 접근 전 존재 확인(무가드 인덱싱 금지).
- `BANDS=["천명","절충","거스름"]`, `ELS=["목","화","토","금","수"]` 상수는 share-tokens 내 정의(또는 C·A 재사용).

## 9. 검증 (성공 기준)

- **유닛**: `share-tokens.test.ts`(왕복 인코딩·무효 토큰 `null`·범위 밖 거부) · `pentagon.test.ts`(5꼭지·각도·정규화·전부0 방어).
- **통합**: 고정 birth+answers → 기대 `palja.code`/`self.code`/`match.band` 스냅(라이브러리 조립 정합, A 골든 `1992-09-12 13:47`→`음강인단` 활용).
- **브라우저 E2E**(dev): intro→quiz(12답)→birth→result 전 스테이지 DOM 단정(⚠️인앱 screenshot 타임아웃 → `read_page`/DOM 단정으로 증거, 메모리). 공유 토큰 URL 재진입 → 티저. 무효 `?r=` → 처음.
- **OG**: `/api/og/saju-mbti?<token>` 200·이미지. 무효 토큰 안전 처리.
- **build**: `npx tsc --noEmit` exit 0 · `next build` 라우트 표에 신규 라우트.

## 10. 후속

- **E 흡수됨** — 입력폼·퍼널·공유가 이 스펙에 포함. 별도 E 스펙 없음.
- **실사용자 파일럿**(B §7·C): 체감 정확도·문항 톤·nurture 흘림 재배치를 실데이터로 판단. D 완료가 파일럿의 전제(돌려볼 화면).
- **배포**: A~D 완성 시 prod 게이트 해제 후보(dev 검증·카톡 공유 실기기 확인 후). 지금까진 전부 dev 로컬.
