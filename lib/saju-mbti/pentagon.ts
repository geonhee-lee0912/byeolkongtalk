import type { FiveElement } from "@/lib/saju/elements";

const ORDER: FiveElement[] = ["목", "화", "토", "금", "수"];

export interface PentAxis {
  element: FiveElement;
  value: number;
  x: number;
  y: number; // 데이터 점
  labelX: number;
  labelY: number;
}
export interface PentGeometry {
  axes: PentAxis[];
  polygon: string; // 데이터 5점
  ring: string; // 가이드 외곽
  cx: number;
  cy: number;
  r: number;
}

export function pentagonGeometry(dist: Record<FiveElement, number>, size: number): PentGeometry {
  const cx = size / 2,
    cy = size / 2,
    r = size * 0.38,
    labelR = size * 0.47;
  const max = Math.max(1, ...ORDER.map((e) => dist[e] ?? 0));
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  const axes: PentAxis[] = ORDER.map((element, i) => {
    const value = dist[element] ?? 0;
    const rr = (value / max) * r;
    return {
      element,
      value,
      x: cx + rr * Math.cos(ang(i)),
      y: cy + rr * Math.sin(ang(i)),
      labelX: cx + labelR * Math.cos(ang(i)),
      labelY: cy + labelR * Math.sin(ang(i)),
    };
  });
  const ring = ORDER.map((_, i) => `${(cx + r * Math.cos(ang(i))).toFixed(2)},${(cy + r * Math.sin(ang(i))).toFixed(2)}`).join(" ");
  return { axes, cx, cy, r, ring, polygon: axes.map((a) => `${a.x.toFixed(2)},${a.y.toFixed(2)}`).join(" ") };
}
