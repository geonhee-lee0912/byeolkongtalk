"use client";

// 면 아이콘 — 이모지 대신 쓰는 공용 아이콘. 색은 글자색(currentColor)을 따르고, 별 재화(star)만 금색 고정.
// 스펙 docs/superpowers/specs/2026-11-09-디자인-다듬기-공통-design.md §2.1
import { useId } from "react";
import { ICON_GLYPHS, type IconName } from "./icon-glyphs";

export type { IconName };

export default function Icon({
  name,
  size = 20,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  /** 있으면 읽어 주는 이름(role=img). 없으면 장식으로 숨김. */
  title?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const body = ICON_GLYPHS[name].body.replaceAll("__ID__", `i${uid}`);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className ? `shrink-0 ${className}` : "shrink-0"}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
