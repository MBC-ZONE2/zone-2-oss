// ============================================================================
// ZONE-2 임베드 위젯 번들 (F8 · REQ-015)
//
// 양사(MBC충북·옥천신문) 홈페이지에 삽입하는 Web Component 위젯.
//   <zone2-crossview-widget data-count="3">   — 최신 크로스뷰 N개 카드
//   <zone2-thermometer-widget data-count="3"> — 공론 온도 TOP N 게이지
//
// 설계 원칙
//   - 바닐라 JS 단일 파일(빌드 스텝·의존성·외부 CDN 0). <script> 로 직접 로드.
//   - Shadow DOM(mode:'open')으로 완전 격리 — 외부 CSS 유입/유출 없음.
//   - API 베이스는 이 스크립트 태그의 origin 을 자동 사용(data-base 로 오버라이드).
//   - 전 예외 흡수: 네트워크·파싱 실패가 삽입 페이지를 절대 깨뜨리지 않는다.
//   - 접근성: role="region"/meter + aria, 색맹 대체(구간 라벨 + CSS 패턴).
//
// 응답 계약 (docs/06 · { data, error })
//   GET /api/crossview   → data: { items, nextCursor }
//   GET /api/temperature → data: { items, computedAt }
// ============================================================================

(function () {
  "use strict";

  // 환경 미지원(구형 브라우저)·중복 로드 방어 — 둘 중 하나면 조용히 종료.
  if (
    !window.customElements ||
    window.customElements.get("zone2-crossview-widget")
  ) {
    return;
  }

  // --------------------------------------------------------------------------
  // 0. API 베이스 origin 자동 결정
  //    document.currentScript 는 "동기 실행 중"에만 유효하므로 최상위에서 즉시
  //    캡처한다. next/script 등으로 비동기 주입될 때를 대비해 파일명 폴백도 둔다.
  // --------------------------------------------------------------------------
  var SCRIPT_ORIGIN = (function detectOrigin() {
    try {
      var src = document.currentScript && document.currentScript.src;
      if (!src) {
        // 폴백: 로드된 스크립트 태그를 파일명으로 역탐색(뒤에서부터).
        var scripts = document.getElementsByTagName("script");
        for (var i = scripts.length - 1; i >= 0; i--) {
          if (scripts[i].src && scripts[i].src.indexOf("zone2-widgets") !== -1) {
            src = scripts[i].src;
            break;
          }
        }
      }
      if (src) return new URL(src).origin;
    } catch (e) {
      // origin 판별 실패 시 현재 페이지 origin 으로 폴백.
    }
    return window.location.origin;
  })();

  /** 요소별 API 베이스 결정 — data-base 우선, 없으면 스크립트 origin. */
  function resolveBase(el) {
    var override = el.getAttribute("data-base");
    var base = (override && override.trim()) || SCRIPT_ORIGIN;
    return base.replace(/\/+$/, ""); // 끝 슬래시 정리
  }

  // --------------------------------------------------------------------------
  // 1. 온도 표시 밴드 (정본: lib/temperature/formula.ts TEMPERATURE_BANDS)
  //    경계는 [min, max) 로 해석(마지막 구간만 100 포함).
  //    색·패턴은 F1/formula 토큰과 동일 값으로 복제(위젯은 외부 CSS 미의존이라
  //    HEX 를 직접 내장한다).
  // --------------------------------------------------------------------------
  var BANDS = [
    { min: 0, max: 20, label: "잠잠", color: "#93c5fd", pattern: "dots" },
    { min: 20, max: 40, label: "미온", color: "#86efac", pattern: "horizontal" },
    { min: 40, max: 60, label: "보통", color: "#fde047", pattern: "diagonal" },
    { min: 60, max: 80, label: "뜨거움", color: "#fdba74", pattern: "grid" },
    { min: 80, max: 100.0001, label: "매우 뜨거움", color: "#fca5a5", pattern: "dashed" },
  ];

  /** 파스텔 배경 위 고정 대비 잉크(패턴 선 색) — temperature-badge.tsx 와 동일. */
  var INK = "#1a2233";

  /** 온도값(0~100)에 해당하는 표시 구간을 반환한다. */
  function bandForTemperature(t) {
    var v = clampTemp(t);
    for (var i = 0; i < BANDS.length; i++) {
      if (v >= BANDS[i].min && v < BANDS[i].max) return BANDS[i];
    }
    return BANDS[BANDS.length - 1];
  }

  /** 0~100 클램프 (NaN/Infinity 방어). */
  function clampTemp(value) {
    var n = Number(value);
    if (!isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return n;
  }

  /**
   * 색맹 대체 패턴 8px 타일을 data-URI 로 만든다(id 없음 → 인스턴스 충돌 무관).
   * temperature-badge.tsx patternBackground 와 동일한 도형·굵기.
   */
  function patternBackground(pattern) {
    var shapes = {
      dots: "<circle cx='2' cy='2' r='1.1' fill='" + INK + "'/>",
      horizontal: "<path d='M0 4h8' stroke='" + INK + "' stroke-width='1.1'/>",
      diagonal: "<path d='M0 8 8 0' stroke='" + INK + "' stroke-width='1.1'/>",
      grid: "<path d='M0 4h8M4 0v8' stroke='" + INK + "' stroke-width='1'/>",
      dashed: "<path d='M1 4h3' stroke='" + INK + "' stroke-width='1.3'/>",
    };
    var svg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'>" +
      shapes[pattern] +
      "</svg>";
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }

  // --------------------------------------------------------------------------
  // 2. 공통 유틸
  // --------------------------------------------------------------------------

  /** setTimeout 기반 지연(ms) 프로미스. */
  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /**
   * 위젯 전체의 유일한 진단 로그 지점(허용된 단일 console.error).
   * 삽입 페이지에는 영향을 주지 않는다(콘솔에만 남긴다).
   */
  function warn(context, detail) {
    if (window.console && console.error) {
      console.error("[zone2-widget] " + context, detail);
    }
  }

  /**
   * DOM 생성 헬퍼. 텍스트는 항상 textContent 로 넣어 인젝션을 원천 차단한다.
   * attrs.class → className, attrs.text → textContent, attrs.style → cssText,
   * 나머지는 setAttribute. children 은 문자열/노드 배열.
   */
  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var key in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
        var val = attrs[key];
        if (val == null) continue;
        if (key === "class") node.className = val;
        else if (key === "text") node.textContent = val;
        else if (key === "style") node.style.cssText = val;
        else node.setAttribute(key, val);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c == null) continue;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  /** 매치 점수(0~1) → 신뢰도 백분율 정수(범위 밖/누락은 null). */
  function confidencePercent(score) {
    if (score == null || !isFinite(score)) return null;
    return Math.round(Math.min(1, Math.max(0, score)) * 100);
  }

  /**
   * 지수 백오프 재시도 fetch(총 시도 = retries + 1).
   * 최종 실패 시에만 reject 하고, 호출부(catch)에서 조용히 처리한다.
   */
  function fetchData(url, retries) {
    var attempt = 0;

    function tryOnce() {
      return fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        credentials: "omit", // Allow-Origin:* 와 호환(자격증명 미전송)
        mode: "cors",
      })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (body) {
          // 표준 봉투 { data, error } 검증. error 가 있거나 data 없으면 실패로 본다.
          if (!body || body.error || body.data == null) {
            throw new Error(
              body && body.error && body.error.code ? body.error.code : "빈 응답",
            );
          }
          return body.data;
        })
        .catch(function (err) {
          if (attempt < retries) {
            attempt += 1;
            return delay(500 * attempt).then(tryOnce); // 0.5s → 1.0s → 1.5s
          }
          throw err;
        });
    }

    return tryOnce();
  }

  // --------------------------------------------------------------------------
  // 3. 공통 스타일 (Shadow DOM 내부 전용) — :host 격리 + 시스템 폰트
  //    :host { all: initial } 로 외부 상속(색·폰트 등)을 끊은 뒤 필요한 값만 재설정.
  // --------------------------------------------------------------------------
  var SYSTEM_FONT =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif';

  var BASE_CSS =
    ":host{all:initial;display:block;box-sizing:border-box;font-family:" +
    SYSTEM_FONT +
    ";font-size:14px;line-height:1.5;color:#19212f;text-align:left;-webkit-font-smoothing:antialiased}" +
    ":host *{box-sizing:border-box}" +
    ".z2-wrap{width:100%;background:#ffffff;border:1px solid #e2e8f2;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px}" +
    ".z2-hd{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:2px}" +
    ".z2-hd-title{font-size:12px;font-weight:700;letter-spacing:.02em;color:#3a6bb5}" +
    ".z2-hd-sub{font-size:11px;color:#56657f}" +
    ".z2-body{display:flex;flex-direction:column;gap:10px}" +
    // 스켈레톤 (shimmer)
    ".z2-sk{border-radius:8px;background:linear-gradient(90deg,#eef2f9 25%,#f6f8fc 37%,#eef2f9 63%);background-size:400% 100%;animation:z2shimmer 1.6s ease-in-out infinite}" +
    "@keyframes z2shimmer{0%{background-position:100% 50%}100%{background-position:0% 50%}}" +
    "@media (prefers-reduced-motion:reduce){.z2-sk{animation:none}}" +
    // 에러/빈 상태 소형 문구
    ".z2-note{font-size:12px;color:#56657f;padding:6px 2px;margin:0}" +
    ".z2-err{font-size:12px;color:#9b1c1c;padding:6px 2px;margin:0}";

  // 크로스뷰 카드 전용 스타일
  var CROSSVIEW_CSS =
    ".z2-cv-card{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid #e2e8f2;border-radius:10px;background:#ffffff}" +
    ".z2-cv-title{margin:0;font-size:14px;font-weight:600;line-height:1.45;color:#19212f}" +
    ".z2-cv-tiers{display:flex;flex-wrap:wrap;gap:6px}" +
    ".z2-pill{display:inline-flex;align-items:center;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600;white-space:nowrap}" +
    ".z2-pill-macro{background:rgba(58,107,181,.1);color:#2f5896}" +
    ".z2-pill-micro{background:#fef3c7;color:#b25a00}" +
    ".z2-cv-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px}" +
    ".z2-cv-score{font-size:12px;color:#56657f;font-variant-numeric:tabular-nums}" +
    ".z2-cv-link{display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:600;color:#3a6bb5;text-decoration:none;white-space:nowrap}" +
    ".z2-cv-link:hover{color:#2f5896;text-decoration:underline}" +
    ".z2-cv-link:focus-visible{outline:2px solid #3a6bb5;outline-offset:2px;border-radius:4px}" +
    ".z2-sk-card{height:96px}";

  // 온도계 게이지 전용 스타일
  var THERMO_CSS =
    ".z2-tm-row{display:flex;flex-direction:column;gap:5px}" +
    ".z2-tm-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}" +
    ".z2-tm-name{font-size:13px;font-weight:600;color:#19212f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".z2-tm-val{font-size:12px;font-weight:700;color:#19212f;white-space:nowrap;font-variant-numeric:tabular-nums}" +
    ".z2-tm-band{font-weight:600;color:#56657f}" +
    ".z2-tm-gauge{position:relative;width:100%;height:12px;border-radius:999px;background:#eef2f9;overflow:hidden}" +
    ".z2-tm-fill{position:relative;height:100%;border-radius:999px;min-width:4px;overflow:hidden;transition:width .3s ease}" +
    "@media (prefers-reduced-motion:reduce){.z2-tm-fill{transition:none}}" +
    ".z2-tm-pattern{position:absolute;inset:0;background-size:8px 8px;opacity:.4;pointer-events:none}" +
    ".z2-sk-row{height:34px}";

  // --------------------------------------------------------------------------
  // 4. 베이스 커스텀 엘리먼트 — 공통 생명주기(마운트/폴링/상태 전환)
  //    ES2015 class 로 HTMLElement 를 상속(모든 Shadow DOM 지원 브라우저에서 동작).
  //    하위 클래스가 아래 훅을 구현한다:
  //      defaultCount() pollInterval() endpoint(n) regionLabel()
  //      headerTitle() styles() skeleton(n) renderData(data, n)
  // --------------------------------------------------------------------------
  class Zone2WidgetBase extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: "open" });
      this._timer = null;
      this._destroyed = false;
      this._hasData = false;
      this._body = null;
    }

    /** 표시 개수 — data-count(1~5 클램프), 미지정/비정상은 기본값. */
    count() {
      var raw = parseInt(this.getAttribute("data-count"), 10);
      if (!isFinite(raw)) raw = this.defaultCount();
      return Math.max(1, Math.min(5, raw));
    }

    /** 최초 1회 셸(스타일 + region 컨테이너)을 심는다. */
    _mount() {
      var style = document.createElement("style");
      style.textContent = BASE_CSS + this.styles(); // 정적 문자열(사용자 입력 없음)

      var wrap = h("div", {
        class: "z2-wrap",
        role: "region",
        "aria-label": this.regionLabel(),
      });
      wrap.appendChild(
        h("div", { class: "z2-hd" }, [
          h("span", { class: "z2-hd-title", text: this.headerTitle() }),
          h("span", { class: "z2-hd-sub", text: "ZONE-2" }),
        ]),
      );
      var body = h("div", { class: "z2-body" });
      wrap.appendChild(body);

      this._shadow.appendChild(style);
      this._shadow.appendChild(wrap);
      this._body = body;
    }

    /** 본문 영역만 교체(헤더/스타일은 유지). */
    _setBody(nodes) {
      var body = this._body;
      body.textContent = "";
      for (var i = 0; i < nodes.length; i++) body.appendChild(nodes[i]);
    }

    /** 데이터 로드 → 상태 전환. 실패는 조용히(데이터 있으면 유지). */
    _load() {
      var self = this;
      var n = this.count();
      var url = resolveBase(this) + this.endpoint(n);

      if (!self._hasData) self._setBody(self.skeleton(n)); // 최초에만 스켈레톤

      fetchData(url, 3)
        .then(function (data) {
          if (self._destroyed) return;
          self._hasData = true;
          self.renderData(data, n);
        })
        .catch(function (err) {
          if (self._destroyed) return;
          // 이미 데이터를 표시 중이면 조용히 유지(폴링 실패로 화면을 깨지 않음).
          if (!self._hasData) {
            self._setBody([
              h("p", { class: "z2-err", text: "불러올 수 없습니다." }),
            ]);
          }
          warn("데이터 로드 실패:", err && err.message ? err.message : err);
        });
    }

    connectedCallback() {
      try {
        this._mount();
        this._load();
        var self = this;
        this._timer = window.setInterval(function () {
          self._load();
        }, this.pollInterval());
      } catch (e) {
        // 마운트 자체 실패도 삽입 페이지로 전파하지 않는다.
        warn("초기화 실패:", e);
      }
    }

    disconnectedCallback() {
      this._destroyed = true;
      if (this._timer) {
        window.clearInterval(this._timer);
        this._timer = null;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 5. 크로스뷰 위젯 — 최신 페어 N개 카드 (30분 폴링)
  // --------------------------------------------------------------------------
  class Zone2CrossviewWidget extends Zone2WidgetBase {
    defaultCount() {
      return 3;
    }
    pollInterval() {
      return 30 * 60 * 1000; // 30분
    }
    endpoint(n) {
      return "/api/crossview?limit=" + n;
    }
    regionLabel() {
      return "ZONE-2 크로스뷰 — 광역·기초 비교 최신 " + this.count() + "건";
    }
    headerTitle() {
      return "크로스뷰 · 두 개의 시선";
    }
    styles() {
      return CROSSVIEW_CSS;
    }
    skeleton(n) {
      var rows = [];
      for (var i = 0; i < n; i++) {
        rows.push(h("div", { class: "z2-sk z2-sk-card" }));
      }
      return rows;
    }
    renderData(data, n) {
      var items = (data && data.items) || [];
      if (!items.length) {
        this._setBody([
          h("p", { class: "z2-note", text: "표시할 크로스뷰가 아직 없습니다." }),
        ]);
        return;
      }
      var base = resolveBase(this);
      var nodes = [];
      for (var i = 0; i < items.length && i < n; i++) {
        nodes.push(this._card(items[i], base));
      }
      this._setBody(nodes);
    }

    /** 페어 1건 → 카드 노드. */
    _card(pair, base) {
      var readingPoint =
        (pair.readingPoint && pair.readingPoint.trim()) ||
        "같은 사안, 두 개의 시선";
      var confidence = confidencePercent(pair.matchScore);
      var scoreText =
        confidence != null
          ? "매칭 신뢰도 " + confidence + "%"
          : "매칭 신뢰도 준비 중";
      var href = base + "/crossview/" + encodeURIComponent(pair.id);

      var link = h(
        "a",
        {
          class: "z2-cv-link",
          href: href,
          target: "_blank",
          rel: "noopener noreferrer",
          "aria-label": '"' + readingPoint + '" 크로스뷰 자세히 보기 (새 창)',
        },
        ["자세히 보기", h("span", { "aria-hidden": "true", text: "→" })],
      );

      return h("article", { class: "z2-cv-card" }, [
        h("p", { class: "z2-cv-title", text: readingPoint }),
        h("div", { class: "z2-cv-tiers" }, [
          h("span", { class: "z2-pill z2-pill-macro", text: "광역 · MBC충북" }),
          h("span", { class: "z2-pill z2-pill-micro", text: "기초 · 옥천신문" }),
        ]),
        h("div", { class: "z2-cv-foot" }, [
          h("span", { class: "z2-cv-score", text: scoreText }),
          link,
        ]),
      ]);
    }
  }

  // --------------------------------------------------------------------------
  // 6. 온도계 위젯 — 공론 온도 TOP N 게이지 (15분 폴링)
  // --------------------------------------------------------------------------
  class Zone2ThermometerWidget extends Zone2WidgetBase {
    defaultCount() {
      return 3;
    }
    pollInterval() {
      return 15 * 60 * 1000; // 15분
    }
    endpoint() {
      return "/api/temperature"; // 보드는 TOP5 반환, 앞에서 N개만 사용
    }
    regionLabel() {
      return "ZONE-2 공론 온도계 — 상위 " + this.count() + "개 이슈";
    }
    headerTitle() {
      return "공론 온도계 · TOP";
    }
    styles() {
      return THERMO_CSS;
    }
    skeleton(n) {
      var rows = [];
      for (var i = 0; i < n; i++) {
        rows.push(h("div", { class: "z2-sk z2-sk-row" }));
      }
      return rows;
    }
    renderData(data, n) {
      var items = (data && data.items) || [];
      if (!items.length) {
        this._setBody([
          h("p", {
            class: "z2-note",
            text: "표시할 온도 데이터가 아직 없습니다.",
          }),
        ]);
        return;
      }
      var nodes = [];
      for (var i = 0; i < items.length && i < n; i++) {
        nodes.push(this._row(items[i]));
      }
      this._setBody(nodes);
    }

    /** 온도 항목 1건 → 게이지 행 노드. */
    _row(item) {
      var name = (item.issue && item.issue.label) || "이슈 미상";
      var temp = clampTemp(item.temperature);
      var value = Math.round(temp);
      var band = bandForTemperature(temp);

      // 게이지 채움 + 색맹 대체 패턴 오버레이
      var pattern = h("div", {
        class: "z2-tm-pattern",
        "aria-hidden": "true",
        style: "background-image:" + patternBackground(band.pattern),
      });
      var fill = h(
        "div",
        {
          class: "z2-tm-fill",
          style: "width:" + temp + "%;background:" + band.color,
        },
        [pattern],
      );
      // role="meter" — 현재값·구간 라벨을 스크린리더에 명시.
      var gauge = h(
        "div",
        {
          class: "z2-tm-gauge",
          role: "meter",
          "aria-valuemin": "0",
          "aria-valuemax": "100",
          "aria-valuenow": String(value),
          "aria-valuetext": value + "도, " + band.label,
          "aria-label": name + " 공론 온도",
        },
        [fill],
      );

      return h("div", { class: "z2-tm-row" }, [
        h("div", { class: "z2-tm-head" }, [
          h("span", { class: "z2-tm-name", text: name }),
          // 색 외에 온도 수치 + 구간 텍스트 라벨을 항상 병기(WCAG 1.4.1).
          h("span", { class: "z2-tm-val" }, [
            value + "° ",
            h("span", { class: "z2-tm-band", text: "· " + band.label }),
          ]),
        ]),
        gauge,
      ]);
    }
  }

  // --------------------------------------------------------------------------
  // 7. 커스텀 엘리먼트 등록 (중복 정의 방어)
  // --------------------------------------------------------------------------
  function define(name, ctor) {
    try {
      if (!window.customElements.get(name)) {
        window.customElements.define(name, ctor);
      }
    } catch (e) {
      warn("커스텀 엘리먼트 등록 실패: " + name, e);
    }
  }

  define("zone2-crossview-widget", Zone2CrossviewWidget);
  define("zone2-thermometer-widget", Zone2ThermometerWidget);
})();
