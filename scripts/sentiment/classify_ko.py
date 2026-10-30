#!/usr/bin/env python3
"""한국어 댓글 감정 분류 사이드카 (KcELECTRA 11감정 → pos/neg/neu).

감정분류는 고빈도·좁은 분류 작업이라 LLM(구독 CLI)보다 전용 모델이 낫다
(속도 수십 ms/건, 무료, 결정적). 온도 수식의 β(감정 분산) 성분이 이 값에
직접 걸려 있다.

모델: nlp04/korean_sentiment_analysis_kcelectra
  - 베이스가 KcELECTRA = 네이버 뉴스 **댓글** 학습 → 지역 민원·여론 텍스트와
    어조가 가깝다. NSMC 계열(영화평·binary)보다 도메인이 맞고, **중립 클래스가
    이미 존재**해 neu 를 임계값으로 만들어낼 필요가 없다.

입출력 (stdin/stdout, JSON):
  입력: ["댓글1", "댓글2", ...]
  출력: {"labels": ["neg", "pos", ...]}          # 입력과 같은 순서·길이
  실패: {"error": "사유"}                         # 종료코드 1

사용:
  echo '["텍스트"]' | python3 scripts/sentiment/classify_ko.py
  python3 scripts/sentiment/classify_ko.py --selftest   # 모델 없이 매핑만 검사
"""

import json
import os
import sys

MODEL_ID = os.environ.get(
    "LOCAL_SENTIMENT_MODEL", "nlp04/korean_sentiment_analysis_kcelectra"
)

# 한 번에 모델에 넣을 개수 (Mac Mini CPU 기준 보수적으로).
BATCH_SIZE = int(os.environ.get("LOCAL_SENTIMENT_BATCH", "16"))

# 모델 입력 상한(토큰) — 여론광장 글 제목은 짧지만 유튜브 댓글은 길 수 있다.
MAX_LENGTH = 256

# 11감정 → 3분류. 모델 config 의 id2label 문자열과 정확히 일치해야 한다.
#   pos 5종 / neu 2종 / neg 4종
LABEL_MAP = {
    "기쁨(행복한)": "pos",
    "고마운": "pos",
    "설레는(기대하는)": "pos",
    "사랑하는": "pos",
    "즐거운(신나는)": "pos",
    "일상적인": "neu",
    "생각이 많은": "neu",
    "슬픔(우울한)": "neg",
    "힘듦(지침)": "neg",
    "짜증남": "neg",
    "걱정스러운(불안한)": "neg",
}


def to_three_class(label: str) -> str:
    """모델 라벨을 pos/neg/neu 로 접는다. 모르는 라벨은 중립 처리."""
    return LABEL_MAP.get(label.strip(), "neu")


def selftest() -> int:
    """모델 없이 매핑 규칙만 검사한다(의존성 없이 CI 에서 돌릴 수 있게)."""
    failures = []

    def check(label: str, passed: bool, detail: str = "") -> None:
        print(f"  {'✅' if passed else '❌'} {label}{f' — {detail}' if detail else ''}")
        if not passed:
            failures.append(label)

    print("[11감정 → 3분류 매핑]")
    check("라벨 11종 전부 정의", len(LABEL_MAP) == 11, f"{len(LABEL_MAP)}종")
    counts = {"pos": 0, "neu": 0, "neg": 0}
    for value in LABEL_MAP.values():
        counts[value] += 1
    check("pos 5 / neu 2 / neg 4", counts == {"pos": 5, "neu": 2, "neg": 4}, str(counts))
    check("'고마운' → pos", to_three_class("고마운") == "pos")
    check("'짜증남' → neg", to_three_class("짜증남") == "neg")
    check("'일상적인' → neu", to_three_class("일상적인") == "neu")
    check("미지의 라벨은 neu", to_three_class("존재하지않는감정") == "neu")
    check(
        "출력값이 pos/neg/neu 뿐",
        set(LABEL_MAP.values()) == {"pos", "neg", "neu"},
    )

    print("")
    if failures:
        print(f"=== FAIL — {len(failures)}건 ===")
        return 1
    print("=== PASS — 매핑 규칙 통과 ===")
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return selftest()

    try:
        texts = json.load(sys.stdin)
    except json.JSONDecodeError as error:
        json.dump({"error": f"입력 JSON 파싱 실패: {error}"}, sys.stdout)
        return 1

    if not isinstance(texts, list) or any(not isinstance(t, str) for t in texts):
        json.dump({"error": "입력은 문자열 배열이어야 합니다"}, sys.stdout)
        return 1

    if not texts:
        json.dump({"labels": []}, sys.stdout)
        return 0

    try:
        # import 는 여기서 — --selftest 는 의존성 없이 돌아야 한다.
        from transformers import pipeline
    except ImportError as error:
        json.dump({"error": f"transformers 미설치: {error}"}, sys.stdout)
        return 1

    try:
        classifier = pipeline(
            "text-classification",
            model=MODEL_ID,
            truncation=True,
            max_length=MAX_LENGTH,
        )
        results = classifier(texts, batch_size=BATCH_SIZE)
    except Exception as error:  # 모델 다운로드 실패·OOM 등 전부 호출부로 알린다
        json.dump({"error": f"분류 실패: {type(error).__name__}: {error}"}, sys.stdout)
        return 1

    # pipeline 은 단건이면 dict, 다건이면 list 를 준다.
    if isinstance(results, dict):
        results = [results]

    labels = [to_three_class(r.get("label", "")) for r in results]
    if len(labels) != len(texts):
        json.dump(
            {"error": f"결과 개수 불일치: 입력 {len(texts)} vs 출력 {len(labels)}"},
            sys.stdout,
        )
        return 1

    json.dump({"labels": labels}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
