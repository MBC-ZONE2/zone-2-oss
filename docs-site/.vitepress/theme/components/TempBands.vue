<script setup>
// ZONE-2 — 공론 온도 5구간 색 칩(머메이드 대체).
// bands: Array<{ key: 'b1'..'b5', name, range }>
defineProps({
  bands: { type: Array, required: true },
});
</script>

<template>
  <div class="ztemp" role="img" aria-label="공론 온도 5구간">
    <template v-for="(b, i) in bands" :key="i">
      <span v-if="i > 0" class="ztemp-arrow" aria-hidden="true">→</span>
      <div class="ztemp-chip" :class="'ztemp-' + b.key">
        <span class="ztemp-name">{{ b.name }}</span>
        <span class="ztemp-range">{{ b.range }}</span>
      </div>
    </template>
  </div>
</template>
