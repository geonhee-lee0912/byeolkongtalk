"use client";

// components/byeolmaru/TodayHeroTile.tsx — 달력 판 안의 오늘 히어로(스펙 §3·§4).
// 🔴 배경에 녹이지 않고 **골드 타일로 띄운다**. 라이트 판에선 이래야 오늘이 산다(다크 판이었다면
//    어둠 위 발광으로 충분했겠지만 §4 가 라이트를 택했다).
import Image from "next/image";
import Link from "next/link";
import type { DayCell } from "@/lib/byeolmaru/calendar";
import { DAY_NAME, DAY_LINE } from "@/lib/byeolmaru/day-label";
import { branchAnimal } from "@/lib/byeolmaru/branch-animal";

const TILE_BG = "linear-gradient(135deg, #FFF3D6 0%, #F2D78A 100%)";
const TILE_SHADOW = "0 3px 14px rgba(232,194,106,0.40)";

export default function TodayHeroTile({ cell, href }: { cell: DayCell; href: string }) {
  const animal = branchAnimal(cell.ganji);
  return (
    <Link
      href={href}
      className="block rounded-2xl p-3.5"
      style={{ background: TILE_BG, boxShadow: TILE_SHADOW }}
    >
      <div className="flex items-center gap-3">
        {animal ? (
          <Image src={animal.assetSrc} alt={animal.animal} width={48} height={48} className="h-12 w-12 shrink-0 object-contain" />
        ) : null}
        <div className="min-w-0 flex-1">
          {/* a11y: 그라데이션 양 끝(#FFF3D6·#F2D78A) 둘 다 재야 한다 — 두 채널이 상단→하단 단조감소라
              중간 지점이 양 끝보다 어두워질 일은 없다(계산은 양 끝만으로 충분). text-eye-purple/70 은
              어두운 쪽 끝(#F2D78A)에서 3.26:1 로 WCAG AA(4.5:1) 미달이라 /90 으로 올렸다(87%가 이론상
              최솟값이지만 여유를 둔다) — 배경(스펙 §4 고정값)은 그대로 둔다. 아래 등급 라벨·DAY_LINE
              도 같은 이유로 /90. */}
          <p className="text-[11px] font-medium text-eye-purple/90">오늘 · {cell.ganji}</p>
          {/* 🔴 이름과 등급을 형제 span 으로 분리한다 — 등급을 이름 span 안에 중첩하면 font-display
              가 상속돼 본문이 타이틀 폰트로 렌더된다(text-xs 는 크기만 덮고 font-family 는 못 덮는다).
              좌우 배치(justify-between)도 쓰지 않는다: 375px 에서 이름×등급 30개 조합 중 12개가
              줄바꿈되며 마주보는 것 없이 둘째 줄이 뜬다. 둘 다 P5-1 에서 실측한 것이다. */}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-display text-lg leading-tight text-eye-purple">{DAY_NAME[cell.tenGod]}</span>
            <span className="text-xs text-eye-purple/90">· {cell.grade.label}</span>
          </div>
          {cell.marks.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {cell.marks.map((m) => (
                <span key={m.glyph} className="rounded-full bg-white/55 px-1.5 py-0.5 text-[10px] font-bold text-eye-purple">
                  <span aria-hidden>{m.glyph}</span> {m.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* a11y: /85 는 어두운 쪽 끝에서 4.41:1 로 근소 미달이라 /90 으로. */}
      <p className="mt-2 text-xs leading-relaxed text-eye-purple/90">{DAY_LINE[cell.tenGod]}</p>
      <p className="mt-1.5 text-right text-xs font-bold text-eye-purple">자세히 보기 →</p>
    </Link>
  );
}
