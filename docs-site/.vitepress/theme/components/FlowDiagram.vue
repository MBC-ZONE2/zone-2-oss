<script setup>
// ZONE-2 — 디자인 전용 플로우 다이어그램(머메이드 대체).
// stages: Array<{ label?, via?, nodes: Array<{ icon?, title, note?, tone?, bullets?[] }> }>
// 데스크탑: 가로 흐름 + 커넥터, 모바일: 세로 스택. 스타일은 custom.css(.zflow-*).
defineProps({
  stages: { type: Array, required: true },
  label: { type: String, default: "흐름도" },
});
</script>

<template>
  <div class="zflow" role="img" :aria-label="label">
    <template v-for="(stage, si) in stages" :key="si">
      <!-- 커넥터(두 번째 스테이지부터) -->
      <div v-if="si > 0" class="zflow-conn" aria-hidden="true">
        <span v-if="stage.via" class="zflow-conn-label">{{ stage.via }}</span>
        <svg class="zflow-arrow" viewBox="0 0 32 16" width="32" height="16">
          <path
            d="M0 8 H26 M20 2 L28 8 L20 14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>

      <!-- 스테이지 -->
      <div class="zflow-stage" :class="{ 'is-group': stage.label }">
        <div v-if="stage.label" class="zflow-stage-label">{{ stage.label }}</div>
        <div class="zflow-nodes">
          <div
            v-for="(n, ni) in stage.nodes"
            :key="ni"
            class="zflow-node"
            :class="n.tone ? 'tone-' + n.tone : ''"
          >
            <span v-if="n.icon" class="zflow-node-icon" aria-hidden="true">{{
              n.icon
            }}</span>
            <span class="zflow-node-body">
              <span class="zflow-node-title">{{ n.title }}</span>
              <span v-if="n.note" class="zflow-node-note">{{ n.note }}</span>
              <span v-if="n.bullets" class="zflow-node-bullets">
                <span
                  v-for="(b, bi) in n.bullets"
                  :key="bi"
                  class="zflow-bullet"
                  >{{ b }}</span
                >
              </span>
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
