# 제3자 소프트웨어 고지 (THIRD_PARTY_NOTICES)

ZONE-2 가 **실행 시 포함·배포하는**(production dependencies) 오픈소스 구성요소와 라이선스 목록입니다. 소스코드 공개 확약서 제4조 3항(제3자 라이선스 고지)에 따라 게시합니다.
개발 전용 의존성(devDependencies)은 배포물에 포함되지 않아 여기 적지 않으며, 전체 목록은 같은 폴더의 CycloneDX SBOM(`sbom.cdx.json`)에 있습니다.

생성: `pnpm licenses ls --prod --json` (2026-10-19), 패키지 121개. 각 패키지의 라이선스 전문은 `node_modules/<이름>/LICENSE*` 또는 홈페이지에서 볼 수 있습니다.

## 주의가 필요한 라이선스

| 패키지 | 라이선스 | 비고 |
|---|---|---|
| `@img/sharp-libvips-darwin-arm64` 1.3.2 | LGPL-3.0-or-later | LGPL-3.0-or-later — libvips 바이너리(동적 링크, 수정 없음). LGPL 조건은 고지와 라이브러리 교체 가능성으로 충족. 실행 플랫폼별 패키지 |
| `caniuse-lite` 1.0.30001793 | CC-BY-4.0 | CC-BY-4.0 — 데이터셋. 이 고지로 저작자 표시(caniuse.com) 충족 |
| `gsap` 3.15.0 | Standard 'no charge' license: https://gsap.com/standard-license. | GSAP Standard 'no charge' license — 무료 사용은 허용되지만 OSI 오픈소스 라이선스가 아니다. 공개 리포에 동봉하지 않고 npm 의존성으로만 설치된다(소스 재배포 아님). 재단·MBC충북 확인 권장 |

## 전체 목록 (production)

| 패키지 | 버전 | 라이선스 | 홈페이지 |
|---|---|---|---|
| `@ai-sdk/anthropic` | 1.2.12 | Apache-2.0 | https://ai-sdk.dev/docs |
| `@ai-sdk/openai` | 1.3.24 | Apache-2.0 | https://ai-sdk.dev/docs |
| `@ai-sdk/provider` | 1.1.3 | Apache-2.0 | https://sdk.vercel.ai/docs |
| `@ai-sdk/provider-utils` | 2.2.8 | Apache-2.0 | https://ai-sdk.dev/docs |
| `@ai-sdk/react` | 1.2.12 | Apache-2.0 | https://ai-sdk.dev/docs |
| `@ai-sdk/ui-utils` | 1.2.11 | Apache-2.0 | https://ai-sdk.dev/docs |
| `@babel/runtime` | 7.29.7 | MIT | https://babel.dev/docs/en/next/babel-runtime |
| `@dmsnell/diff-match-patch` | 1.1.0 | Apache-2.0 | https://github.com/dmsnell/diff-match-patch#readme |
| `@img/colour` | 1.1.0 | MIT | https://github.com/lovell/colour#readme |
| `@img/sharp-darwin-arm64` | 0.35.3 | Apache-2.0 | https://sharp.pixelplumbing.com |
| `@img/sharp-libvips-darwin-arm64` | 1.3.2 | LGPL-3.0-or-later | https://sharp.pixelplumbing.com |
| `@next/env` | 15.5.24 | MIT | https://github.com/vercel/next.js#readme |
| `@next/swc-darwin-arm64` | 15.5.24 | MIT | https://github.com/vercel/next.js#readme |
| `@opentelemetry/api` | 1.9.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js/tree/main/api |
| `@radix-ui/primitive` | 1.1.4 | MIT | https://radix-ui.com/primitives |
| `@radix-ui/react-compose-refs` | 1.1.3 | MIT | https://radix-ui.com/primitives |
| `@radix-ui/react-context` | 1.1.4 | MIT | https://radix-ui.com/primitives |
| `@radix-ui/react-dialog` | 1.1.18 | MIT | https://radix-ui.com/primitives |
| `@radix-ui/react-dismissable-layer` | 1.1.14 | MIT | https://radix-ui.com/primitives |
| `@radix-ui/react-focus-guards` | 1.1.4 | MIT | https://radix-ui.com/primitives |
| `@radix-ui/react-focus-scope` | 1.1.11 | MIT | https://radix-ui.com/primitives |
| `@radix-ui/react-id` | 1.1.2 | MIT | https://radix-ui.com/primitives |
| `@radix-ui/react-portal` | 1.1.13 | MIT | https://radix-ui.com/primitives |
| `@radix-ui/react-presence` | 1.1.6 | MIT | https://radix-ui.com/primitives |
| `@radix-ui/react-primitive` | 2.1.7 | MIT | https://radix-ui.com/primitives |
| `@radix-ui/react-slot` | 1.3.0 | MIT | https://radix-ui.com/primitives |
| `@radix-ui/react-use-callback-ref` | 1.1.2 | MIT | https://radix-ui.com/primitives |
| `@radix-ui/react-use-controllable-state` | 1.2.3 | MIT | https://radix-ui.com/primitives |
| `@radix-ui/react-use-effect-event` | 0.0.3 | MIT | https://radix-ui.com/primitives |
| `@radix-ui/react-use-layout-effect` | 1.1.2 | MIT | https://radix-ui.com/primitives |
| `@supabase/auth-js` | 2.106.2 | MIT | https://github.com/supabase/supabase-js/tree/master/packages/core/auth-js |
| `@supabase/functions-js` | 2.106.2 | MIT | https://github.com/supabase/supabase-js/tree/master/packages/core/functions-js |
| `@supabase/phoenix` | 0.4.2 | MIT | https://github.com/supabase/phoenix#readme |
| `@supabase/postgrest-js` | 2.106.2 | MIT | https://github.com/supabase/supabase-js/tree/master/packages/core/postgrest-js |
| `@supabase/realtime-js` | 2.106.2 | MIT | https://github.com/supabase/supabase-js/tree/master/packages/core/realtime-js |
| `@supabase/ssr` | 0.7.0 | MIT | https://github.com/supabase/ssr#readme |
| `@supabase/storage-js` | 2.106.2 | MIT | https://github.com/supabase/supabase-js/tree/master/packages/core/storage-js |
| `@supabase/supabase-js` | 2.106.2 | MIT | https://github.com/supabase/supabase-js/tree/master/packages/core/supabase-js |
| `@swc/helpers` | 0.5.15 | Apache-2.0 | https://swc.rs |
| `@types/d3-array` | 3.2.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-array |
| `@types/d3-color` | 3.1.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-color |
| `@types/d3-ease` | 3.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-ease |
| `@types/d3-interpolate` | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-interpolate |
| `@types/d3-path` | 3.1.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-path |
| `@types/d3-scale` | 4.0.9 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-scale |
| `@types/d3-shape` | 3.1.8 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-shape |
| `@types/d3-time` | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-time |
| `@types/d3-timer` | 3.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-timer |
| `@types/node` | 22.19.19 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node |
| `@types/react` | 19.2.15 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react |
| `@types/react-dom` | 19.2.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom |
| `ai` | 4.3.19 | Apache-2.0 | https://ai-sdk.dev/docs |
| `aria-hidden` | 1.2.6 | MIT | https://github.com/theKashey/aria-hidden#readme |
| `caniuse-lite` | 1.0.30001793 | CC-BY-4.0 | https://github.com/browserslist/caniuse-lite#readme |
| `client-only` | 0.0.1 | MIT | https://reactjs.org/ |
| `clsx` | 2.1.1 | MIT | https://github.com/lukeed/clsx#readme |
| `cookie` | 1.1.1 | MIT | https://github.com/jshttp/cookie#readme |
| `csstype` | 3.2.3 | MIT | https://github.com/frenic/csstype#readme |
| `d3-array` | 3.2.4 | ISC | https://d3js.org/d3-array/ |
| `d3-color` | 3.1.0 | ISC | https://d3js.org/d3-color/ |
| `d3-ease` | 3.0.1 | BSD-3-Clause | https://d3js.org/d3-ease/ |
| `d3-format` | 3.1.2 | ISC | https://d3js.org/d3-format/ |
| `d3-interpolate` | 3.0.1 | ISC | https://d3js.org/d3-interpolate/ |
| `d3-path` | 3.1.0 | ISC | https://d3js.org/d3-path/ |
| `d3-scale` | 4.0.2 | ISC | https://d3js.org/d3-scale/ |
| `d3-shape` | 3.2.0 | ISC | https://d3js.org/d3-shape/ |
| `d3-time` | 3.1.0 | ISC | https://d3js.org/d3-time/ |
| `d3-time-format` | 4.1.0 | ISC | https://d3js.org/d3-time-format/ |
| `d3-timer` | 3.0.1 | ISC | https://d3js.org/d3-timer/ |
| `decimal.js-light` | 2.5.1 | MIT | https://github.com/MikeMcl/decimal.js-light#readme |
| `dequal` | 2.0.3 | MIT | https://github.com/lukeed/dequal#readme |
| `detect-libc` | 2.1.2 | Apache-2.0 | https://github.com/lovell/detect-libc#readme |
| `detect-node-es` | 1.1.0 | MIT | https://github.com/thekashey/detect-node |
| `dom-helpers` | 5.2.1 | MIT | https://github.com/react-bootstrap/dom-helpers#readme |
| `eventemitter3` | 4.0.7 | MIT | https://github.com/primus/eventemitter3#readme |
| `fast-equals` | 5.4.0 | MIT | https://github.com/planttheidea/fast-equals#readme |
| `get-nonce` | 1.0.1 | MIT | https://github.com/theKashey/get-nonce |
| `gsap` | 3.15.0 | Standard 'no charge' license: https://gsap.com/standard-license. | https://gsap.com |
| `iceberg-js` | 0.8.1 | MIT | https://github.com/supabase/iceberg-js#readme |
| `internmap` | 2.0.3 | ISC | https://github.com/mbostock/internmap/ |
| `js-tokens` | 4.0.0 | MIT | https://github.com/lydell/js-tokens#readme |
| `json-schema` | 0.4.0 | (AFL-2.1 OR BSD-3-Clause) | https://github.com/kriszyp/json-schema#readme |
| `jsondiffpatch` | 0.7.6 | MIT | https://github.com/benjamine/jsondiffpatch |
| `lodash` | 4.18.1 | MIT | https://lodash.com/ |
| `loose-envify` | 1.4.0 | MIT | https://github.com/zertosh/loose-envify |
| `nanoid` | 3.3.12 | MIT | https://github.com/ai/nanoid#readme |
| `next` | 15.5.24 | MIT | https://nextjs.org |
| `object-assign` | 4.1.1 | MIT | https://github.com/sindresorhus/object-assign#readme |
| `picocolors` | 1.1.1 | ISC | https://github.com/alexeyraspopov/picocolors#readme |
| `postcss` | 8.5.15 | MIT | https://postcss.org/ |
| `prop-types` | 15.8.1 | MIT | https://facebook.github.io/react/ |
| `react` | 19.2.6 | MIT | https://react.dev/ |
| `react-dom` | 19.2.6 | MIT | https://react.dev/ |
| `react-is` | 16.13.1, 18.3.1 | MIT | https://reactjs.org/ |
| `react-remove-scroll` | 2.7.2 | MIT | https://github.com/theKashey/react-remove-scroll#readme |
| `react-remove-scroll-bar` | 2.3.8 | MIT | https://github.com/theKashey/react-remove-scroll-bar#readme |
| `react-smooth` | 4.0.4 | MIT | https://github.com/recharts/react-smooth#readme |
| `react-style-singleton` | 2.2.3 | MIT | https://github.com/theKashey/react-style-singleton#readme |
| `react-transition-group` | 4.4.5 | BSD-3-Clause | https://github.com/reactjs/react-transition-group#readme |
| `recharts` | 2.15.4 | MIT | https://github.com/recharts/recharts |
| `recharts-scale` | 0.4.5 | MIT | https://github.com/recharts/recharts-scale |
| `scheduler` | 0.27.0 | MIT | https://react.dev/ |
| `secure-json-parse` | 2.7.0 | BSD-3-Clause | https://github.com/fastify/secure-json-parse#readme |
| `semver` | 7.8.5 | ISC | https://github.com/npm/node-semver#readme |
| `sharp` | 0.35.3 | Apache-2.0 | https://sharp.pixelplumbing.com |
| `sonner` | 2.0.7 | MIT | https://sonner.emilkowal.ski/ |
| `source-map-js` | 1.2.1 | BSD-3-Clause | https://github.com/7rulnik/source-map-js |
| `styled-jsx` | 5.1.6 | MIT | https://github.com/vercel/styled-jsx#readme |
| `swr` | 2.4.1 | MIT | https://swr.vercel.app |
| `tailwind-merge` | 3.6.0 | MIT | https://github.com/dcastil/tailwind-merge |
| `three` | 0.185.1 | MIT | https://threejs.org/ |
| `throttleit` | 2.1.0 | MIT | https://github.com/sindresorhus/throttleit#readme |
| `tiny-invariant` | 1.3.3 | MIT | https://github.com/alexreardon/tiny-invariant#readme |
| `tslib` | 2.8.1 | 0BSD | https://www.typescriptlang.org/ |
| `undici-types` | 6.21.0 | MIT | https://undici.nodejs.org |
| `use-callback-ref` | 1.3.3 | MIT | https://github.com/theKashey/use-callback-ref#readme |
| `use-sidecar` | 1.1.3 | MIT | https://github.com/theKashey/use-sidecar |
| `use-sync-external-store` | 1.6.0 | MIT | https://github.com/facebook/react#readme |
| `victory-vendor` | 36.9.2 | MIT AND ISC | https://commerce.nearform.com/open-source/victory |
| `zod` | 3.25.76 | MIT | https://zod.dev |
| `zod-to-json-schema` | 3.25.2 | ISC | https://github.com/StefanTerdell/zod-to-json-schema#readme |

## 번들되지 않는 자산의 고지

- **Pretendard**(`public/fonts/PretendardVariable.woff2`) — SIL Open Font License 1.1, © Kil Hyung-jin. 라이선스 전문 `public/fonts/OFL-Pretendard.txt`. https://github.com/orioncactus/pretendard
- **Phosphor Icons**(`public/icons/`) — MIT, © Phosphor Icons. 라이선스 전문 `public/icons/PHOSPHOR-LICENSE.txt`
- **한국언론진흥재단 CI**(`public/logos/kpf*.png`) — 재단의 상표. 지원사업 표기 용도로만 쓰며 재배포·포크 시 재단 허락 없이 사용할 수 없다(제거할 것).
- **ZONE-2 로고**(`public/logos/zone2-*.png`) — 컨소시엄 저작물. `zone2-ondark.png` 는 검은 바탕용으로 원본 화이트판의 검정 부분을 종이색으로 바꾼 파생본.
- **MBC충북·옥천신문 로고 및 명칭**(`public/logos/`) — 각 사의 상표. Apache-2.0 제6조에 따라 이 소프트웨어 라이선스의 허락 대상이 아니며, 포크·재배포 시 자사 표식으로 교체해야 한다(NOTICE 참조).
