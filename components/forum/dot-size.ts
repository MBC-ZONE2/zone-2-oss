// ============================================================================
// components/forum/dot-size — 공감 수 → 목록 앞 점 크기 단계 (서버/클라 공용 순수 함수)
//
// 0 = 빈 링(점선 원) · 1~4 = 12px · 5~19 = 16px · 20+ = 24px (app/forum.css .fo-dot)
// ============================================================================

export function dotSize(likeCount: number): 0 | 1 | 2 | 3 {
  if (likeCount >= 20) return 3;
  if (likeCount >= 5) return 2;
  if (likeCount >= 1) return 1;
  return 0;
}
