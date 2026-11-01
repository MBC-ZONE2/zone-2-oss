"use client";

// ============================================================================
// components/forum/my-posts — "내 글" 기억 (localStorage, 최소 구현)
//
// 로그인 없는 공론장에서 내가 쓴 글 id 를 브라우저에 남겨 두고, 목록·상세에서
// 그 글 옆에 잉크 점(.fo-mine)을 앉힌다. 글 작성 성공 시, 그리고 비밀번호로
// 수정에 성공했을 때(소유 증명) 기록한다. 서버 로직·API 와 무관한 표시용이다.
// ============================================================================

import { useEffect, useState } from "react";

const KEY = "zone2.forum.myPosts.v1";
const MAX = 100;

/** 저장된 내 글 id 목록 (실패·SSR 이면 빈 배열) */
export function readMyPostIds(): string[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

/** 내 글 id 기록 (중복 없이 최신을 앞에, 최대 MAX 건) */
export function rememberMyPost(id: string): void {
  try {
    if (typeof window === "undefined" || !id) return;
    const next = [id, ...readMyPostIds().filter((v) => v !== id)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장 불가 환경 — 표시만 생략 */
  }
}

/** 마운트 후 localStorage 를 읽어 내 글 여부를 돌려준다 (SSR 은 항상 false) */
export function useIsMyPost(id: string): boolean {
  const [mine, setMine] = useState(false);
  useEffect(() => {
    setMine(readMyPostIds().includes(id));
  }, [id]);
  return mine;
}
