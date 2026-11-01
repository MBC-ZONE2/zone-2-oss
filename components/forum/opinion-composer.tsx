"use client";

// ============================================================================
// components/forum/opinion-composer — 의견 작성기 하나 (<OpinionComposer>)
//
// 크로스뷰 상세 검은 타일 · 카드 스토리 4페이지 · 공론장 글쓰기 · 공론장 댓글이
// 전부 이 컴포넌트 하나를 쓴다. 구성은 variant 와 무관하게 늘 같다:
//   1. (free 만) 제목 한 줄 — "제목 (선택)"
//   2. 큰 입력창(3줄 → 최대 8줄 자동 높이). 글자 수는 상한 90% 넘을 때만 표시
//   3. [이름 (선택)] [비밀번호 4자 이상] 2열 — 접힘 없음. 비번 밑 "수정·삭제할 때 필요합니다"
//   4. 오류 한 줄(버튼 위, "!") → '올리기' 검정 블록 52px ("올리는 중…" + disabled)
//      검증 실패 시 첫 오류 필드(본문 → 비번 → 이름 → 제목)로, 서버 오류 시 본문으로 포커스
//   5. 성공: 입력 초기화 + "올렸습니다" 2초 + onCreated(item). 목록 낙관적 추가는 호출측.
//
// variant:
//   issue   — 크로스뷰 사안 의견. createPost({ title:null, body, articleId }) → router.refresh
//   free    — 공론장 자유 건의. createPost({ title, body, articleId:null }).
//             onCreated 가 없으면(서버 페이지 마운트) 이전 PostForm 처럼 /forum/:id 로 이동
//   comment — 게시글 댓글. createComment(postId, { body, nickname, password })
// 검증·API·비번 규칙은 lib/forum/schema(createPostSchema / createCommentSchema)와
// client-api 를 그대로 쓴다(본문 최소 길이·비번 4자+). 모더레이션 보류(is_flagged)는
// 목록에 붙이지 않고 안내만 한다. 스타일: app/composer.css(.opc)
// ============================================================================

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ForumComment, ForumPost } from "@/types";
import { createCommentSchema, createPostSchema, FORUM_LIMITS } from "@/lib/forum/schema";
import { createComment, createPost, fetchCaptcha, uploadForumImage, ForumApiError } from "./client-api";
import { FORUM_IMAGE_MAX_BYTES } from "@/lib/forum/image";
import { rememberMyPost } from "./my-posts";
import "@/app/composer.css";

export type ComposerVariant = "issue" | "free" | "comment";
/** 자유 건의를 올렸을 때 목록(PostList)에 알리는 이벤트 — detail: ForumPost */
export const FORUM_POSTED_EVENT = "zone2:forum-posted";
export type ComposerTone = "paper" | "dark";

interface BaseProps {
  /** 종이 위(기본) / 검은 타일 안 */
  tone?: ComposerTone;
  className?: string;
}
interface IssueProps extends BaseProps {
  variant: "issue";
  /** 의견을 연결할 기사 id — forum_posts(article_id) */
  articleId: string | null;
  onCreated?: (post: ForumPost) => void;
}
interface FreeProps extends BaseProps {
  variant: "free";
  articleId?: null;
  /** 없으면 작성 후 /forum/:id 로 이동한다(공론장 목록 페이지 기본 동작) */
  onCreated?: (post: ForumPost) => void;
}
interface CommentProps extends BaseProps {
  variant: "comment";
  /** 댓글을 달 게시글 id */
  postId: string;
  onCreated?: (comment: ForumComment) => void;
}
export type OpinionComposerProps = IssueProps | FreeProps | CommentProps;

type FieldKey = "title" | "body" | "nickname" | "password";
type FieldErrors = Partial<Record<FieldKey, string>>;

const PLACEHOLDER: Record<ComposerVariant, string> = {
  issue: "이 사안에 대한 생각을 남겨 주세요",
  free: "지역에 바라는 점, 함께 논의하고 싶은 주제를 써 주세요",
  comment: "댓글을 남겨 주세요",
};

/** 오류 한 줄에 보일 우선순위 — 본문 → 비밀번호 → 이름 → 제목 */
const ERROR_ORDER: FieldKey[] = ["body", "password", "nickname", "title"];

/** 자동 높이 상한(줄) · 확인 줄 표시 시간(ms) · 글자 수 카운터 노출 비율 */
const MAX_ROWS = 8;
const OK_MS = 2000;
const COUNTER_RATIO = 0.9;

/** 스키마 검증 결과에서 필드별 첫 메시지만 추린다 */
function collectErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const next: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (
      (key === "title" || key === "body" || key === "nickname" || key === "password") &&
      !next[key]
    ) {
      next[key] = issue.message;
    }
  }
  return next;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function OpinionComposer(props: OpinionComposerProps) {
  const { variant, tone = "paper", className } = props;
  const router = useRouter();
  const uid = useId();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const nickRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const okTimer = useRef<number | null>(null);

  const [body, setBody] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  // 자동등록방지(2026-10-19) — 서버가 낸 덧셈 문제. 첫 입력 때 받아 오고, 실패·제출 뒤 새로 받는다
  const [captcha, setCaptcha] = useState<{ token: string; question: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const captchaRef = useRef<HTMLInputElement>(null);
  // 사진 1장(게시글만) — 선택 즉시 미리보기, 올리기 때 업로드
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [honeypot, setHoneypot] = useState("");

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    try {
      setCaptcha(await fetchCaptcha());
      setCaptchaAnswer("");
    } catch {
      setCaptcha(null);
    } finally {
      setCaptchaLoading(false);
    }
  }, []);
  // 처음 입력이 시작될 때 문제를 받는다(화면만 보는 사람에게 요청을 내지 않게)
  const captchaRequested = useRef(false);
  useEffect(() => {
    if (captchaRequested.current || (body.length === 0 && password.length === 0 && !photo)) return;
    captchaRequested.current = true;
    void loadCaptcha();
  }, [body, password, photo, loadCaptcha]);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setFormError("사진 파일만 올릴 수 있습니다");
      return;
    }
    if (f.size > FORUM_IMAGE_MAX_BYTES) {
      setFormError("사진은 5MB 이하만 올릴 수 있습니다");
      return;
    }
    setFormError(null);
    setPhoto(f);
  }
  function clearPhoto() {
    setPhoto(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [okLine, setOkLine] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const bodyMax = variant === "comment" ? FORUM_LIMITS.commentMax : FORUM_LIMITS.bodyMax;
  const showCounter = body.length >= Math.floor(bodyMax * COUNTER_RATIO);

  // 큰 입력창 자동 높이 — 최소 3줄(rows) → 최대 8줄. 넘치면 안에서 스크롤
  useIsoLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    const cs = window.getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || 28;
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    // 사방 1px 괘선(포커스 2px) — 위·아래를 더해야 마지막 줄이 안 잘린다(#178 뒤 수정)
    const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    const max = Math.round(lh * MAX_ROWS + pad + border);
    el.style.height = `${Math.min(el.scrollHeight + border, max)}px`;
  }, [body]);

  useEffect(
    () => () => {
      if (okTimer.current !== null) window.clearTimeout(okTimer.current);
    },
    [],
  );

  // 서버 오류 뒤 본문 포커스 예약 — 필드는 submitting 동안 disabled 라 그 뒤 effect 에서 옮긴다
  const focusBodyAfterEnable = useRef(false);
  useEffect(() => {
    if (submitting || !focusBodyAfterEnable.current) return;
    focusBodyAfterEnable.current = false;
    bodyRef.current?.focus();
  }, [submitting]);

  const showOk = useCallback((text: string) => {
    setOkLine(text);
    if (okTimer.current !== null) window.clearTimeout(okTimer.current);
    okTimer.current = window.setTimeout(() => setOkLine(null), OK_MS);
  }, []);

  function reset() {
    clearPhoto();
    setCaptcha(null);
    setCaptchaAnswer("");
    captchaRequested.current = false;
    setBody("");
    setNickname("");
    setPassword("");
  }

  /** 검증 실패 → ERROR_ORDER 상 첫 오류 필드로 포커스(오류 한 줄은 role=alert 로 따로 낭독) */
  // title 은 입력 칸이 없다(2026-10-19) — 서버가 title 오류를 돌려줘도 포커스할 곳이 없어 건너뛴다
  const fieldRefs: Partial<Record<FieldKey, React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>>> = {
    body: bodyRef,
    password: pwRef,
    nickname: nickRef,
  };
  function focusFirstError(errors: FieldErrors) {
    const key = ERROR_ORDER.find((k) => errors[k]);
    if (key) fieldRefs[key]?.current?.focus();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    setOkLine(null);

    setSubmitting(true);
    try {
      if (props.variant === "comment") {
        if (!captcha || captchaAnswer.trim() === "") {
          setFormError("자동등록방지 답을 입력해 주세요");
          if (!captcha) void loadCaptcha();
          captchaRef.current?.focus();
          return;
        }
        const result = createCommentSchema.safeParse({
          body,
          nickname,
          password,
          captcha: { token: captcha.token, answer: captchaAnswer.trim() },
          website: honeypot,
        });
        if (!result.success) {
          const errors = collectErrors(result.error.issues);
          setFieldErrors(errors);
          // 칸 밖 오류(캡차·숨은 칸)는 폼 한 줄로
          if (Object.keys(errors).length === 0) setFormError(result.error.issues[0]?.message ?? "입력값을 확인해 주세요");
          focusFirstError(errors);
          return;
        }
        setFieldErrors({});
        const created = await createComment(props.postId, {
          body: result.data.body,
          nickname: result.data.nickname,
          password: result.data.password,
          captcha: { token: captcha.token, answer: captchaAnswer.trim() },
          website: honeypot,
        });
        reset();
        if (created.isFlagged) {
          setFormError("검토 대기로 전환되었습니다. 검토 후 게시될 수 있습니다.");
          return;
        }
        props.onCreated?.(created);
        showOk("올렸습니다");
        return;
      }

      // issue · free — 게시글. issue 는 제목 없이(null) 기사에 연결한다.
      const articleId = props.variant === "issue" ? props.articleId : null;
      if (!captcha || captchaAnswer.trim() === "") {
        setFormError("자동등록방지 답을 입력해 주세요");
        if (!captcha) void loadCaptcha();
        captchaRef.current?.focus();
        return;
      }
      const result = createPostSchema.safeParse({
        title: undefined, // 제목 칸 없음(2026-10-19) — 서버가 null 로 저장
        body,
        articleId,
        nickname,
        password,
        captcha: { token: captcha.token, answer: captchaAnswer.trim() },
        website: honeypot,
      });
      if (!result.success) {
        const errors = collectErrors(result.error.issues);
        setFieldErrors(errors);
        if (Object.keys(errors).length === 0) setFormError(result.error.issues[0]?.message ?? "입력값을 확인해 주세요");
        focusFirstError(errors);
        return;
      }
      setFieldErrors({});
      // 사진이 있으면 먼저 올린다(실패하면 글도 올리지 않는다)
      let imageUrl: string | null = null;
      if (photo) {
        imageUrl = (await uploadForumImage(photo)).url;
      }
      const post = await createPost({
        title: result.data.title,
        body: result.data.body,
        articleId,
        nickname: result.data.nickname,
        password: result.data.password,
        imageUrl,
        captcha: { token: captcha.token, answer: captchaAnswer.trim() },
        website: honeypot,
      });
      reset();
      if (post.isFlagged) {
        setFormError("검토 대기로 전환되었습니다. 검토 후 게시될 수 있습니다.");
        return;
      }
      rememberMyPost(post.id);
      if (props.variant === "issue") {
        props.onCreated?.(post);
        showOk("올렸습니다");
        // 서버 목록·숫자도 조용히 동기화(낙관적 행은 부모가 id 로 중복 제거)
        router.refresh();
        return;
      }
      // free
      if (props.onCreated) {
        props.onCreated(post);
        showOk("올렸습니다");
        router.refresh();
        return;
      }
      // 상세로 가지 않고 목록에 바로 보인다(2026-10-19 피드백) — 목록(PostList)이 이 이벤트를 받아
      // 자유 건의 탭으로 바꾸고 맨 위에 끼운 뒤 그 자리로 스크롤한다. 서버 목록도 조용히 갱신
      showOk("올렸습니다 — 목록 맨 위에 있습니다");
      window.dispatchEvent(new CustomEvent(FORUM_POSTED_EVENT, { detail: post }));
      router.refresh();
    } catch (err) {
      setFormError(
        err instanceof ForumApiError ? err.message : "작성 중 오류가 발생했습니다.",
      );
      // 서버가 거절했으면 문제는 썼거나 만료됐을 수 있다 — 새 문제로
      void loadCaptcha();
      // 서버 오류 — 다시 고칠 자리인 본문으로 포커스(submitting 해제 뒤 disabled 가 풀린 다음)
      focusBodyAfterEnable.current = true;
    } finally {
      setSubmitting(false);
    }
  }

  const bodyId = `${uid}-body`;
  const nickId = `${uid}-nick`;
  const pwId = `${uid}-pw`;
  const noteId = `${uid}-pw-note`;
  const msgId = `${uid}-msg`;
  const captchaId = `${uid}-captcha`;
  const photoId = `${uid}-photo`;
  const hpId = `${uid}-hp`;

  // 버튼 위 한 줄 — 서버/폼 오류가 우선, 없으면 필드 오류 중 첫 것
  const firstFieldError = ERROR_ORDER.map((k) => fieldErrors[k]).find(Boolean) ?? null;
  const errorLine = formError ?? firstFieldError;

  const classes = ["opc", tone === "dark" ? "opc-dark" : "opc-paper", `opc-${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <form className={classes} onSubmit={handleSubmit} noValidate>
      {/* 자유 건의 제목 칸은 뺐다(2026-10-19 피드백 — 본문이 곧 글, Threads·X 식). title 은 null 로 저장된다 */}

      <div className="opc-body-wrap">
        <label htmlFor={bodyId} className="opc-sr">
          {variant === "comment" ? "댓글" : "내용"}
        </label>
        <textarea
          ref={bodyRef}
          id={bodyId}
          className="opc-body"
          value={body}
          rows={3}
          maxLength={bodyMax}
          onChange={(e) => setBody(e.target.value)}
          placeholder={PLACEHOLDER[variant]}
          aria-invalid={Boolean(fieldErrors.body)}
          aria-describedby={fieldErrors.body ? msgId : undefined}
          disabled={submitting}
        />
        {showCounter ? (
          <span className="opc-count" role="status" aria-live="polite">
            {body.length.toLocaleString()}/{bodyMax.toLocaleString()}
          </span>
        ) : null}
      </div>

      <div className="opc-ident">
        <div className="opc-cell">
          <label htmlFor={nickId} className="opc-sr">
            이름 (선택)
          </label>
          <input
            ref={nickRef}
            id={nickId}
            type="text"
            className="opc-input"
            value={nickname}
            maxLength={20}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="이름 (선택)"
            autoComplete="nickname"
            aria-invalid={Boolean(fieldErrors.nickname)}
            aria-describedby={fieldErrors.nickname ? msgId : undefined}
            disabled={submitting}
          />
        </div>
        <div className="opc-cell">
          <label htmlFor={pwId} className="opc-sr">
            비밀번호 (4자 이상)
          </label>
          <input
            ref={pwRef}
            id={pwId}
            type="password"
            className="opc-input"
            value={password}
            minLength={4}
            maxLength={128}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 4자 이상"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? `${noteId} ${msgId}` : noteId}
            disabled={submitting}
          />
          <p id={noteId} className="opc-note">
            수정·삭제할 때 필요합니다
          </p>
        </div>
      </div>

      {/* 사진 1장(게시글만, 2026-10-19) — 선택 → 미리보기 → 올리기 때 업로드 */}
      {variant !== "comment" ? (
        <div className="opc-photo">
          <input
            ref={photoInputRef}
            id={photoId}
            type="file"
            accept="image/*"
            className="opc-sr"
            onChange={pickPhoto}
            disabled={submitting}
          />
          {photoPreview ? (
            <div className="opc-photo-prev">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="첨부할 사진 미리보기" />
              <button type="button" className="opc-photo-x" onClick={clearPhoto} disabled={submitting} aria-label="사진 빼기">
                사진 빼기 ×
              </button>
            </div>
          ) : (
            <label htmlFor={photoId} className="opc-photo-add">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="5" width="18" height="14" rx="0" />
                <circle cx="9" cy="10" r="2" />
                <path d="M21 16l-5-5-7 7" />
              </svg>
              사진 1장 넣기 <span className="opc-photo-hint">(선택 · 5MB 이하)</span>
            </label>
          )}
        </div>
      ) : null}

      {/* 자동등록방지(2026-10-19) — 서버 덧셈 문제. 봇의 빈칸·즉시 제출·재사용을 막는다 */}
      <div className="opc-captcha">
        <label htmlFor={captchaId} className="opc-captcha-q">
          <span className="opc-captcha-k">자동등록방지</span>
          {captcha ? (
            <span className="opc-captcha-eq">
              {captcha.question} = <span className="opc-sr">얼마입니까?</span>
            </span>
          ) : (
            <span className="opc-captcha-eq is-wait">{captchaLoading ? "문제 받는 중…" : "입력을 시작하면 문제가 나옵니다"}</span>
          )}
        </label>
        <input
          ref={captchaRef}
          id={captchaId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          className="opc-input opc-captcha-in"
          value={captchaAnswer}
          maxLength={3}
          onChange={(e) => setCaptchaAnswer(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="답"
          autoComplete="off"
          disabled={submitting || !captcha}
          aria-describedby={msgId}
        />
        <button type="button" className="opc-captcha-new" onClick={() => void loadCaptcha()} disabled={submitting || captchaLoading}>
          다른 문제
        </button>
      </div>
      {/* honeypot — 사람에게 보이지 않는 칸. 봇이 채우면 서버가 거절한다 */}
      <div className="opc-hp" aria-hidden="true">
        <label htmlFor={hpId}>웹사이트</label>
        <input id={hpId} type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      </div>

      <div className="opc-foot">
        {/* 오류(assertive) 와 확인(polite) 은 한 자리를 번갈아 쓴다 */}
        <p
          id={msgId}
          className={`opc-msg${errorLine ? " is-error" : okLine ? " is-ok" : ""}`}
          role={errorLine ? "alert" : "status"}
          aria-live={errorLine ? "assertive" : "polite"}
        >
          {errorLine ?? okLine ?? ""}
        </p>
        <button
          type="submit"
          className="opc-submit"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? "올리는 중…" : "올리기"}
        </button>
      </div>
    </form>
  );
}
