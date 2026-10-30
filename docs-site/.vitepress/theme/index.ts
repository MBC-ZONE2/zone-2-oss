import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import { nextTick, watch } from "vue";
import { useRoute } from "vitepress";
import { initReveal } from "./reveal";
import FlowDiagram from "./components/FlowDiagram.vue";
import TempBands from "./components/TempBands.vue";
import DomainTopology from "./components/DomainTopology.vue";
import "./custom.css";

// ZONE-2 custom theme — extends VitePress default with a polished navy/editorial
// look, refined tokens, and a subtle scroll-reveal. Offline-safe (no CDN).
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("FlowDiagram", FlowDiagram);
    app.component("TempBands", TempBands);
    app.component("DomainTopology", DomainTopology);
  },
  setup() {
    const route = useRoute();
    const run = () => nextTick(() => initReveal());
    if (typeof window !== "undefined") {
      run();
      watch(() => route.path, () => run());
    }
  },
} satisfies Theme;
