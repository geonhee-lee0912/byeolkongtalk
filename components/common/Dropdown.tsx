"use client";

// 커스텀 드롭다운 — 시스템 <select> 대체. 트리거·열린 목록·스크롤바까지
// 디자인 시스템(cream/lilac 토큰)으로 통일. controlled(value/onChange) 드롭인.
import { useEffect, useRef, useState } from "react";

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownProps {
  value: string; // 현재 값 ("" = placeholder)
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string; // value === "" 일 때 표시 (예: "모름")
  ariaLabel?: string;
  className?: string; // 트리거 버튼 추가 클래스
  disabled?: boolean;
}

export default function Dropdown({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  className,
  disabled,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  // 바깥 클릭 닫기 (mousedown — 래퍼 내부 클릭은 무시) + Escape 로 닫기.
  // Escape 는 열린 동안 document 에서 가로채 stopPropagation — 부모 모달(window keydown)이
  // 같은 Escape 로 함께 닫히는 것을 막는다(드롭다운만 닫히고 모달은 유지).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    // 캡처 단계로 부모(window bubble)보다 먼저 잡아 stopImmediatePropagation —
    // 부모 모달이 같은 Escape 로 함께 닫히는 것을 확실히 차단.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // 열림/하이라이트 이동 시 해당 옵션을 목록 내에서 보이게 스크롤
  useEffect(() => {
    if (open && highlighted >= 0) {
      optionRefs.current[highlighted]?.scrollIntoView({ block: "nearest" });
    }
  }, [open, highlighted]);

  const openList = () => {
    if (disabled) return;
    setHighlighted(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (
        e.key === "Enter" ||
        e.key === " " ||
        e.key === "ArrowDown" ||
        e.key === "ArrowUp"
      ) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setHighlighted((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlighted((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setHighlighted(0);
        break;
      case "End":
        e.preventDefault();
        setHighlighted(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (highlighted >= 0 && highlighted < options.length) {
          select(options[highlighted].value);
        }
        break;
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onTriggerKeyDown}
        className={`w-full rounded-xl bg-cream-warm border border-lilac-mid/40 px-3 py-2.5 text-[14px] text-eye-purple flex items-center justify-between gap-1 transition disabled:opacity-60 disabled:cursor-not-allowed ${
          className ?? ""
        }`}
      >
        <span
          className={`min-w-0 truncate text-left ${
            selectedOption ? "" : "text-text-light/60"
          }`}
        >
          {selectedOption ? selectedOption.label : placeholder ?? ""}
        </span>
        <span
          className={`shrink-0 text-lilac-mid transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 mt-1 z-50 rounded-xl bg-cream border border-lilac-mid/40 shadow-[0_8px_24px_rgba(90,62,140,0.16)] max-h-[240px] overflow-y-auto scrollbar-hover py-1"
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === highlighted;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                ref={(el) => {
                  optionRefs.current[idx] = el;
                }}
                onClick={() => select(opt.value)}
                onMouseEnter={() => setHighlighted(idx)}
                className={`block w-full px-3 py-2.5 text-[14px] text-left cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-lilac-soft text-lilac-deep font-bold"
                    : isHighlighted
                      ? "bg-lilac-soft/60 text-eye-purple"
                      : "text-eye-purple hover:bg-lilac-soft/60"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
