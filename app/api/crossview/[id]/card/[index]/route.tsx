// ============================================================================
// GET /api/crossview/[id]/card/[index] — 카드뉴스 컷 PNG (REQ-006 · GH#18)
//
// crossview_pairs.card_data.slides[index] 를 1080×1350(4:5) PNG 로 렌더한다.
//
// [저장 정책] 즉석 렌더 + 캐시 헤더. 스토리지에 저장하지 않는다.
//   원문·발행일은 승인된 페어의 연결 기사에서, 표지의 공론 온도는 최신 기상도
//   배치에서 가져온다. 온도 갱신 주기(15분)에 맞춰 CDN 캐시도 짧게 유지한다.
//
// 지면 규칙은 에디토리얼 시스템을 따른다(괘선·명판·Noto Serif KR).
// ============================================================================

import { ImageResponse } from "next/og";
import type { Article } from "@/types";
import { createClient } from "@/lib/supabase/server";
import {
  getApprovedPair,
  sourceLabel as mediaSourceLabel,
  type CrossviewPairWithArticles,
} from "@/lib/matching";
import {
  TEMPERATURE_BANDS,
  bandForTemperature,
  getTemperatureBoard,
} from "@/lib/temperature";
import { koreanFontSet } from "@/lib/og/fonts";
import { matchIssueTemperature } from "@/components/home/format";

export const dynamic = "force-dynamic";

/** 카드 규격 — deliverables/01 §5 */
const WIDTH = 1080;
const HEIGHT = 1350;

/** ZONE-2 디자인 토큰 (globals.css 라이트 팔레트와 같은 의미 체계) */
const INK = "#14202e";
const MUTED = "#52606d";
const PAPER = "#fbfaf7";
const SURFACE_MUTED = "#f0eee8";
const BRAND = "#1e3a63";
const ACTION = "#3a6bb5";
const WARNING = "#b25a00";

interface Slide {
  kind: string;
  title: string;
  body: string;
  sourceLabel?: string;
}

interface Attribution {
  tier: "광역" | "기초";
  media: string;
  published: string;
  accent: string;
}

interface TemperatureMeta {
  /** 실제 최신 온도. 매핑할 수 없으면 null이며 수치를 임의 생성하지 않는다. */
  value: number | null;
  bandLabel: string;
  color: string;
  issueLabel: string | null;
  activeBand: number;
}

const PENDING_TEMPERATURE: TemperatureMeta = {
  value: null,
  bandLabel: "집계 중",
  color: SURFACE_MUTED,
  issueLabel: null,
  activeBand: -1,
};

const PUBLISHED_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Seoul",
});

/** card_data(open shape)에서 슬라이드를 안전 파싱한다 */
function parseSlides(cardData: unknown): Slide[] {
  if (!cardData || typeof cardData !== "object") return [];
  const slides = (cardData as { slides?: unknown }).slides;
  if (!Array.isArray(slides)) return [];

  return slides
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      kind: typeof s.kind === "string" ? s.kind : "point",
      title: typeof s.title === "string" ? s.title : "",
      body: typeof s.body === "string" ? s.body : "",
      sourceLabel: typeof s.sourceLabel === "string" ? s.sourceLabel : undefined,
    }))
    .filter((s) => s.title || s.body);
}

/** 과거 open-shape 데이터가 비정상적으로 길어도 푸터를 침범하지 않게 제한한다. */
function truncateCardText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/** 컷 종류별 강조색 — 캐러셀(card-carousel)의 의미 체계와 같다. */
function accentColor(kind: string): string {
  if (kind === "macro") return ACTION;
  if (kind === "micro") return WARNING;
  return BRAND;
}

function roleLabel(kind: string): string {
  if (kind === "macro") return "광역의 시선";
  if (kind === "micro") return "기초의 시선";
  if (kind === "cover") return "크로스뷰";
  return "짚어보기";
}

/** ISO 발행 시각을 서울 기준 YYYY.MM.DD로 표시한다. */
function formatPublishedDate(value: string | null | undefined): string {
  if (!value) return "발행일 미상";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "발행일 미상";

  const parts = PUBLISHED_DATE_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}.${month}.${day}` : "발행일 미상";
}

function toAttribution(
  article: Article | null,
  tier: Attribution["tier"],
  accent: string,
  fallbackMedia?: string,
): Attribution {
  return {
    tier,
    media: article
      ? mediaSourceLabel(article.source)
      : fallbackMedia?.trim() || "출처 미상",
    published: formatPublishedDate(article?.publishedAt),
    accent,
  };
}

/** 표지는 양쪽 원문, 관점 컷은 해당 원문의 정본 메타를 쓴다. */
function attributionsForSlide(
  slide: Slide,
  pair: CrossviewPairWithArticles,
): Attribution[] {
  const macro = toAttribution(
    pair.macro,
    "광역",
    ACTION,
    slide.kind === "macro" ? slide.sourceLabel : undefined,
  );
  const micro = toAttribution(
    pair.micro,
    "기초",
    WARNING,
    slide.kind === "micro" ? slide.sourceLabel : undefined,
  );

  if (slide.kind === "macro") return [macro];
  if (slide.kind === "micro") return [micro];
  return [macro, micro];
}

/**
 * 페어와 온도 점수의 직접 FK가 없어 홈 기상도와 같은 표시 규칙을 쓴다.
 * 기사 카테고리와 최신 이슈 라벨이 서로 포함될 때만 실제 온도로 인정한다.
 */
async function temperatureForPair(
  pair: CrossviewPairWithArticles,
): Promise<TemperatureMeta> {
  const macroCategory = pair.macro?.category;
  const microCategory = pair.micro?.category;
  if (!macroCategory && !microCategory) return PENDING_TEMPERATURE;

  try {
    // TOP5 밖의 동일 카테고리도 찾을 수 있도록 최신 배치를 최대치로 읽는다.
    const board = await getTemperatureBoard(50);
    const item =
      matchIssueTemperature(macroCategory, board.items) ??
      matchIssueTemperature(microCategory, board.items);
    if (!item || !Number.isFinite(item.temperature)) return PENDING_TEMPERATURE;

    const clamped = Math.min(100, Math.max(0, item.temperature));
    const value = Math.round(clamped);
    // 표시 숫자만 반올림하고 구간은 원점수의 [min, max) 경계를 지킨다.
    const band = bandForTemperature(clamped);
    return {
      value,
      bandLabel: band.label,
      color: band.color,
      issueLabel: item.issue?.label?.trim() || null,
      activeBand: TEMPERATURE_BANDS.findIndex(
        (candidate) => candidate.label === band.label,
      ),
    };
  } catch (error) {
    // 온도는 보조 정보다. 조회 실패가 원문 카드 생성까지 막지 않게 한다.
    console.error("카드뉴스 공론 온도 조회 실패:", error);
    return PENDING_TEMPERATURE;
  }
}

function errorResponse(status: number, message: string): Response {
  return Response.json({ data: null, error: { message } }, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  try {
    const { id, index } = await params;
    if (!/^\d+$/.test(index)) {
      return errorResponse(400, "잘못된 컷 번호입니다.");
    }
    const slideIndex = Number(index);
    if (!Number.isSafeInteger(slideIndex)) {
      return errorResponse(400, "잘못된 컷 번호입니다.");
    }

    const supabase = await createClient();
    const pair = await getApprovedPair(supabase, id);
    if (!pair) return errorResponse(404, "크로스뷰 페어를 찾을 수 없습니다.");

    const slides = parseSlides(pair.cardData);
    const slide = slides[slideIndex];
    if (!slide) return errorResponse(404, "해당 컷이 없습니다.");

    const attributions = attributionsForSlide(slide, pair);
    const temperature =
      slide.kind === "cover" ? await temperatureForPair(pair) : null;

    return await renderCard(
      slide,
      slideIndex,
      slides.length,
      attributions,
      temperature,
    );
  } catch (error) {
    console.error("카드뉴스 이미지 생성 실패:", error);
    return errorResponse(500, "카드 이미지를 생성하지 못했습니다.");
  }
}

/** 표지 전용 공론 기상도 배지 — 수치·구간명·5단 눈금을 함께 보여 준다. */
function TemperatureBadge({
  temperature,
}: {
  temperature: TemperatureMeta;
}) {
  const valueLabel =
    temperature.value == null ? temperature.bandLabel : `${temperature.value}°`;

  return (
    <div
      style={{
        width: 340,
        display: "flex",
        flexDirection: "column",
        padding: "18px 22px 17px",
        borderRadius: 18,
        backgroundColor: temperature.color,
        color: INK,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          fontSize: 21,
          fontWeight: 700,
          letterSpacing: 1.2,
        }}
      >
        <div style={{ display: "flex" }}>공론 기상도</div>
        {temperature.issueLabel ? (
          <div
            style={{
              display: "flex",
              maxWidth: 155,
              fontSize: 19,
              opacity: 0.72,
            }}
          >
            {truncateCardText(temperature.issueLabel, 12)}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginTop: 8,
        }}
      >
        <div style={{ display: "flex", fontSize: 39, fontWeight: 700 }}>
          {valueLabel}
        </div>
        {temperature.value != null ? (
          <div style={{ display: "flex", fontSize: 22, fontWeight: 700 }}>
            {temperature.bandLabel}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          gap: 5,
          width: "100%",
          marginTop: 12,
        }}
      >
        {TEMPERATURE_BANDS.map((band, index) => (
          <div
            key={band.label}
            style={{
              display: "flex",
              flex: 1,
              height: 6,
              borderRadius: 999,
              backgroundColor: band.color,
              opacity:
                temperature.activeBand < 0 || index > temperature.activeBand
                  ? 0.32
                  : 1,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SourceFooter({
  attributions,
  dark,
}: {
  attributions: Attribution[];
  dark: boolean;
}) {
  const foreground = dark ? PAPER : INK;
  const muted = dark ? PAPER : MUTED;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 28,
        marginTop: "auto",
        paddingTop: 28,
        borderTop: `1px solid ${dark ? "#fbfaf766" : "#52606d66"}`,
      }}
    >
      <div
        style={{
          display: "flex",
          flex: 1,
          gap: attributions.length > 1 ? 34 : 0,
        }}
      >
        {attributions.map((item) => (
          <div
            key={item.tier}
            style={{
              display: "flex",
              flexDirection: "column",
              ...(attributions.length > 1 ? { flex: 1 } : {}),
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: muted,
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 1.2,
                opacity: dark ? 0.72 : 0.9,
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 8,
                  height: 8,
                  borderRadius: item.tier === "기초" ? 999 : 0,
                  backgroundColor: dark ? PAPER : item.accent,
                }}
              />
              <div style={{ display: "flex" }}>{`원문 · ${item.tier}`}</div>
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 8,
                color: foreground,
                fontSize: attributions.length > 1 ? 24 : 28,
                fontWeight: 700,
              }}
            >
              {`${item.media} · ${item.published}`}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          flexShrink: 0,
          color: foreground,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 1.8,
            color: dark ? PAPER : BRAND,
          }}
        >
          ZONE-2
        </div>
      </div>
    </div>
  );
}

/** 슬라이드 한 컷을 PNG 로 렌더한다 */
async function renderCard(
  slide: Slide,
  index: number,
  total: number,
  attributions: Attribution[],
  temperature: TemperatureMeta | null,
): Promise<ImageResponse> {
  const isCover = slide.kind === "cover";
  const accent = accentColor(slide.kind);
  const role = roleLabel(slide.kind);
  const counter = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  const title = truncateCardText(slide.title, isCover ? 48 : 64);
  const body = truncateCardText(slide.body, isCover ? 100 : 140);
  const articleTitleSize =
    title.length > 52 ? 50 : title.length > 36 ? 57 : 66;
  const articleBodySize = body.length > 108 ? 32 : 36;
  const coverHeadline = body || title;
  const coverHeadlineSize =
    coverHeadline.length > 80
      ? 52
      : coverHeadline.length > 58
        ? 58
        : coverHeadline.length > 38
          ? 64
          : 72;

  const fontText = [
    title,
    body,
    role,
    counter,
    "ZONE-2",
    "원문",
    "보도 핵심",
    ...attributions.flatMap((item) => [
      item.tier,
      item.media,
      item.published,
    ]),
    ...(temperature
      ? [
          "공론 기상도",
          temperature.value == null ? "집계 중" : `${temperature.value}°`,
          temperature.bandLabel,
          truncateCardText(temperature.issueLabel ?? "", 12),
          ...TEMPERATURE_BANDS.map((band) => band.label),
        ]
      : []),
  ].join("");
  // 실제로 그릴 문자를 모두 포함한 기존 Noto Serif KR 서브셋을 받는다.
  const fonts = await koreanFontSet(fontText);

  const foreground = isCover ? PAPER : INK;
  const muted = isCover ? PAPER : MUTED;

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxSizing: "border-box",
          backgroundColor: isCover ? BRAND : PAPER,
          color: foreground,
          padding: "70px 76px 58px",
          fontFamily: "Noto Serif KR",
        }}
      >
        {/* 표지는 두 관점의 색을, 본문 컷은 해당 관점의 색을 얇은 스파인으로 쓴다. */}
        {isCover ? (
          <div
            style={{
              position: "absolute",
              inset: "0 0 auto 0",
              height: 12,
              display: "flex",
            }}
          >
            <div
              style={{ display: "flex", width: "50%", backgroundColor: ACTION }}
            />
            <div
              style={{ display: "flex", width: "50%", backgroundColor: WARNING }}
            />
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              inset: "0 auto 0 0",
              width: 14,
              display: "flex",
              backgroundColor: accent,
            }}
          />
        )}

        {/* 상단 명판 — 역할과 컷 번호만 남겨 원문 메타와 중복되지 않게 한다. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 15,
              color: isCover ? PAPER : accent,
              fontSize: 27,
              fontWeight: 700,
              letterSpacing: 2.2,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 13,
                height: 13,
                borderRadius: slide.kind === "micro" ? 999 : 0,
                backgroundColor: isCover ? PAPER : accent,
              }}
            />
            <div style={{ display: "flex" }}>{role}</div>
          </div>
          <div
            style={{
              display: "flex",
              color: muted,
              fontSize: 23,
              fontWeight: 700,
              letterSpacing: 1.5,
              opacity: isCover ? 0.72 : 0.9,
            }}
          >
            {counter}
          </div>
        </div>

        {/* 뷰당 한 번만 쓰는 에디토리얼 이중 괘선 */}
        <div
          style={{
            display: "flex",
            height: 5,
            marginTop: 25,
            borderTop: `1px solid ${foreground}`,
            borderBottom: `1px solid ${foreground}`,
            opacity: isCover ? 0.9 : 1,
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
          }}
        >
          {isCover && temperature ? (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 34,
              }}
            >
              <TemperatureBadge temperature={temperature} />
            </div>
          ) : null}

          {isCover ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* 표지의 고정 문구는 키커, 실제 readingPoint를 공유 헤드라인으로 둔다. */}
              {body ? (
                <div
                  style={{
                    display: "flex",
                    marginTop: 34,
                    color: PAPER,
                    fontSize: 29,
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    opacity: 0.72,
                  }}
                >
                  {title}
                </div>
              ) : null}
              <div
                style={{
                  display: "flex",
                  marginTop: body ? 24 : 38,
                  maxWidth: 900,
                  color: PAPER,
                  fontSize: coverHeadlineSize,
                  fontWeight: 700,
                  lineHeight: 1.28,
                  letterSpacing: -1.6,
                }}
              >
                {coverHeadline}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  marginTop: 52,
                  maxWidth: 900,
                  color: foreground,
                  fontSize: articleTitleSize,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  letterSpacing: -1.8,
                }}
              >
                {title}
              </div>

              {body ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    marginTop: 38,
                    padding: "28px 34px 31px 38px",
                    borderLeft: `8px solid ${accent}`,
                    backgroundColor: SURFACE_MUTED,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      color: accent,
                      fontSize: 18,
                      fontWeight: 700,
                      letterSpacing: 1.5,
                    }}
                  >
                    보도 핵심
                  </div>
                  <div
                    style={{
                      display: "flex",
                      marginTop: 14,
                      color: MUTED,
                      fontSize: articleBodySize,
                      fontWeight: 400,
                      lineHeight: 1.54,
                    }}
                  >
                    {body}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <SourceFooter attributions={attributions} dark={isCover} />
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: fonts.length > 0 ? fonts : undefined,
      headers: {
        // [캐시 정책] 표지(cover)만 공론 온도가 15분마다 바뀌므로 짧게 캐시한다.
        //   나머지 컷(광역·기초·짚어보기)은 페어 승인 시 확정돼 사실상 불변이라
        //   1일 캐시로 첫 생성 후 재렌더를 없앤다(브라우저·CDN 재사용). immutable 은
        //   재매칭으로 페어가 갱신될 때 최대 1년 낡을 수 있어 쓰지 않는다.
        "Cache-Control": isCover
          ? "public, max-age=300, s-maxage=900"
          : "public, max-age=86400, s-maxage=86400",
      },
    },
  );
}
