#!/bin/bash
# 세션 시작: scripts/agent/start.sh — 두 플랫폼·로컬·클라우드 공통. 항상 종료 0.
# fetch·(기본 브랜치면) 빨리감기·합쳐진 로컬 브랜치 삭제 → ROADMAP.md "다음" + 진행 중 브랜치의 HANDOFF.md 머리를 찍는다.
# 기본 브랜치는 AGENT_BASE_BRANCH(없으면 dev).
BASE=${AGENT_BASE_BRANCH:-dev}
root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "저장소 안에서 실행할 것"; exit 0; }
cd "$root" || exit 0

git fetch --prune -q origin || echo "fetch 실패 — 네트워크를 확인할 것(계속 진행)"

current=$(git branch --show-current)
if [ "$current" = "$BASE" ]; then
  git pull -q --ff-only || echo "빨리감기 불가 — 두 자리가 $BASE 를 건드렸다. 운영자에게"
fi

# 원격 기본 브랜치에 이미 합쳐진 로컬 브랜치만 지운다. dev·main·현재 브랜치는 건드리지 않는다.
merged=$(git branch --merged "origin/$BASE" --format='%(refname:short)' | grep -vE "^(dev|main|$current)$")
if [ -n "$merged" ]; then
  echo "== 합쳐진 로컬 브랜치 삭제"
  printf '%s\n' "$merged" | xargs -r git branch -d
fi

echo "== ROADMAP.md 다음"
if [ -f ROADMAP.md ]; then
  next=$(awk '/^## 다음/{f=1;next} /^## /{f=0} f' ROADMAP.md)
  [ -n "$next" ] && printf '%s\n' "$next" || echo "(다음 비어 있음)"
else
  echo "(ROADMAP.md 없음)"
fi

echo "== 진행 중 브랜치 (origin/$BASE 에 안 합쳐진 것)"
# origin/HEAD(짧은 이름 "origin")·main·dev·backup-* 은 일이 아니라 뺀다
branches=$(git branch -r --no-merged "origin/$BASE" --format='%(refname:short)' | grep '/' | grep -vE '/(HEAD|main|dev|backup-[^/]*)$')
if [ -z "$branches" ]; then
  echo "진행 중 브랜치 없음"
else
  titles=""
  for b in $branches; do
    echo "== $b"
    if h=$(git show "$b:HANDOFF.md" 2>/dev/null); then
      printf '%s\n' "$h" | head -20
      titles="$titles
$(printf '%s\n' "$h" | head -1 | sed 's/^# HANDOFF — //')"
    else
      echo "(HANDOFF.md 없음)"
    fi
  done
  # "다음" 줄 가운데 어느 HANDOFF 제목을 품은 줄은 진행 중으로 표시(로드맵 줄은 제목 뒤에 상세가 붙어도 된다)
  if [ -n "$next" ]; then
    echo "== 다음 중 진행 중"
    printf '%s\n' "$next" | while IFS= read -r line; do
      printf '%s\n' "$titles" | while IFS= read -r t; do
        [ -n "$t" ] && case "$line" in *"$t"*) echo "$line ← 진행 중";; esac
      done
    done
  fi
fi

echo "start 완료 — 다음: 브랜치를 고르고 HANDOFF.md '자리' 줄을 고쳐 커밋·푸시"
exit 0
