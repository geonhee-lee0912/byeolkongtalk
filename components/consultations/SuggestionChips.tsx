"use client";

interface SuggestionChipsProps {
  suggestions: string[];
  onPick: (question: string) => void;
  disabled?: boolean;
}

export default function SuggestionChips({
  suggestions,
  onPick,
  disabled,
}: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 pb-2.5">
      {suggestions.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          disabled={disabled}
          className="px-3 py-1.5 rounded-full bg-cream-warm border border-gold text-eye-purple text-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
