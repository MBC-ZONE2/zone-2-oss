<script setup>
// ZONE-2 — 도메인/서브도메인 라우팅 토폴로지.
// 사용자 → Cloudflare Named Tunnel(하나) → 여러 서브도메인 분기.
// 스타일: custom.css(.ztopo-*, 커넥터는 .zflow-conn 재사용).
defineProps({
  client: { type: Object, required: true }, // { icon, title, note? }
  hub: { type: Object, required: true }, // { icon, title, name?, note? }
  nodes: { type: Array, required: true }, // [{ icon, domain, role, note?, canonical?, redirect? }]
  branchLabel: { type: String, default: "하나의 터널이 서브도메인으로 분기" },
});
</script>

<template>
  <div class="ztopo" role="img" aria-label="도메인 · 서브도메인 라우팅 구조">
    <!-- 사용자 -->
    <div class="ztopo-trunknode">
      <span class="zflow-node-icon" aria-hidden="true">{{ client.icon }}</span>
      <span class="zflow-node-body">
        <span class="zflow-node-title">{{ client.title }}</span>
        <span v-if="client.note" class="zflow-node-note">{{ client.note }}</span>
      </span>
    </div>

    <div class="zflow-conn" aria-hidden="true">
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

    <!-- Cloudflare Named Tunnel (허브) -->
    <div class="ztopo-trunknode ztopo-hub">
      <span class="ztopo-hub-icon" aria-hidden="true">{{ hub.icon }}</span>
      <span class="zflow-node-body">
        <span class="zflow-node-title"
          >{{ hub.title
          }}<span v-if="hub.name" class="ztopo-tag">{{ hub.name }}</span></span
        >
        <span v-if="hub.note" class="zflow-node-note">{{ hub.note }}</span>
      </span>
    </div>

    <div class="zflow-conn" aria-hidden="true">
      <span class="zflow-conn-label">{{ branchLabel }}</span>
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

    <!-- 서브도메인 분기 -->
    <div class="ztopo-nodes">
      <div
        v-for="(n, i) in nodes"
        :key="i"
        class="ztopo-leaf"
        :class="{ 'is-canonical': n.canonical, 'is-redirect': n.redirect }"
      >
        <span class="ztopo-leaf-icon" aria-hidden="true">{{ n.icon }}</span>
        <span class="ztopo-leaf-body">
          <span class="ztopo-domain">{{ n.domain }}</span>
          <span class="ztopo-role">{{ n.role }}</span>
          <span v-if="n.note" class="ztopo-leaf-note">{{ n.note }}</span>
          <span v-if="n.redirect" class="ztopo-redirect">
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path
                d="M4 12 H18 M13 7 L19 12 L13 17"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            301 → {{ n.redirect }}
          </span>
        </span>
      </div>
    </div>
  </div>
</template>
