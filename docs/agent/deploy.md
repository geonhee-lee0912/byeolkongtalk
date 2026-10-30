# 운영 배포 절차 (dev → main)

운영자가 이 세션에서 "prod 배포하자"고 말했을 때만 한다. 에이전트는 PR 까지, **머지 버튼은 운영자**가 누른다 — 그게 배포 승인이다. dev→main 정식 머지는 "되돌리기 어려운 일"이라 반대편 리뷰도 받는다.
앱 ① 조건(아래 3번 점검의 첫 항목)의 지금 상태는 저장소에서 알 수 없으니 운영자에게 묻는다. (2026-10-30 기준)

1. `git fetch origin main dev` 후 `git switch -c deploy/<날짜>-<n> origin/main`.
2. 통째면 `git merge --no-ff -F <파일> origin/dev`, 일부면 해당 커밋만 `git cherry-pick`. `lib/sensitive.ts` 충돌은 dev 쪽을 고른다. 다른 충돌은 어떻게 풀었는지 PR 본문에 적는다.
3. `scripts/agent/deploy-check.sh`. 걸리면 멈추고 목록을 운영자에게 보여 준다. 운영자가 허락한 항목만 넘어간다. DB 마이그레이션이 있으면 로컬 세션으로 넘긴다(사전 검증에 prod DB 가 필요하다).
4. 그 브랜치에서 타입·테스트·빌드(`AGENTS.md` "명령").
5. 대조: 통째 머지면 `git rev-parse HEAD^{tree}` 가 `origin/dev^{tree}` 와 같은지, 일부면 바뀐 파일이 dev 와 같은지(`git diff --quiet <dev커밋> HEAD -- <파일>`). 다르면 이유를 PR 에 적는다.
6. push 후 PR(base `main`), 제목 `deploy: dev -> main (YYYY-MM-DD #n) - 요약`. 본문 맨 위에 사용자에게 바뀌는 것, 나가는 커밋 수, 2~5 결과, 그리고 "**Create a merge commit** 으로 머지할 것(Squash·Rebase 금지)".
7. 운영자에게 PR 링크를 주고 멈춘다. 머지 전에 다시 push 했으면 3~5 를 다시 한다.
8. 머지 뒤 실물 확인: `gh api repos/geonhee-lee0912/byeolkongtalk/commits/<머지sha>/status`(Vercel success), `gh api repos/geonhee-lee0912/byeolkongtalk/deployments`(Production sha 최신), Node `fetch` 로 `https://byeolkongtalk.com/api/health`, 공개 페이지 JS 청크에서 새 문자열 grep.
9. Vercel 빌드가 `next/font/google` 로 실패하면 코드를 고치지 말고 운영자에게 Vercel 대시보드 재배포를 요청한다. 그동안 직전 배포가 계속 서비스된다.

- 마이그레이션과 그걸 읽는 코드는 따로 올린다 — 마이그레이션 커밋 먼저 → Supabase 체크 success → 나머지. prod 머지도 같은 순서.
- 보안 수정은 dev push 시점에 공개된다(공개 저장소) — prod 패치까지의 창을 짧게 잡는다.
