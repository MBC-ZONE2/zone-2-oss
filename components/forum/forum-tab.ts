// 공론장 목록 탭("사안 댓글" | "자유 건의") — 서버 페이지와 클라이언트 목록이 함께 쓰는 순수 모듈.
// ("use client" 모듈의 함수를 서버에서 호출할 수 없어 여기로 분리)
export type ForumTab = "issue" | "free";

/** ?tab= 값 검증. 그 외는 null(목록이 기본 탭을 정한다). */
export function parseForumTab(value: string | undefined | null): ForumTab | null {
  return value === "issue" || value === "free" ? value : null;
}
