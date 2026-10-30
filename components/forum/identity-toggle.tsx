"use client";

// ============================================================================
// components/forum/identity-toggle — 익명 / 실명 표시 토글 (기본 익명)
//
// 실명 선택 시 소셜 닉네임(로그인 상태)을 미리 보여 준다. 로그인 전에는 안내만.
// ============================================================================

import { cn } from "@/lib/utils";

interface IdentityToggleProps {
  realName: boolean;
  onChange: (realName: boolean) => void;
  /** 로그인 상태의 소셜 닉네임 (없으면 null) */
  nickname: string | null;
}

const OPTION_BASE = cn(
  "min-h-9 rounded-md px-4 text-sm font-semibold transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action",
);

export function IdentityToggle({
  realName,
  onChange,
  nickname,
}: IdentityToggleProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="radiogroup"
        aria-label="표시 이름"
        className="inline-flex w-fit gap-0.5 rounded-lg border border-line bg-surface-muted p-0.5"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!realName}
          onClick={() => onChange(false)}
          className={cn(
            OPTION_BASE,
            !realName
              ? "bg-surface text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          익명
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={realName}
          onClick={() => onChange(true)}
          className={cn(
            OPTION_BASE,
            realName
              ? "bg-surface text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          실명
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {realName
          ? nickname
            ? `실명 표시: ${nickname}`
            : "로그인하면 소셜 닉네임으로 표시됩니다."
          : "익명(익명-****)으로 표시됩니다."}
      </p>
    </div>
  );
}
