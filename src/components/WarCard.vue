<script setup lang="ts">
import type { War } from '../composables/useWars'

defineProps<{
  war: War
  index: number
}>()
</script>

<template>
  <div class="war-card">
    <div class="war-index">{{ index + 1 }}</div>
    <div class="war-body">
      <div class="war-name">{{ war.name }}</div>
      <div class="war-meta">
        <span class="meta-item">📍 {{ war.country1 }} vs. {{ war.country2 }}</span>
        <span class="meta-sep">·</span>
        <span class="meta-item">⏱ {{ war.duration }}</span>
        <span class="meta-sep">·</span>
        <span class="meta-item">💀 {{ war.casualties }}</span>
      </div>
    </div>
    <div class="war-badge">{{ war.badge }}</div>
  </div>
</template>

<style scoped>
.war-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 215, 0, 0.18);
  border-radius: 8px;
  padding: 16px 20px;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  transition: background 0.2s, border-color 0.2s, transform 0.2s;
  animation: slide-in 0.35s ease both;
}

.war-card:hover {
  background: rgba(255, 215, 0, 0.07);
  border-color: rgba(255, 215, 0, 0.45);
  transform: translateX(4px);
}

@keyframes slide-in {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}

.war-index {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 38px;
  color: var(--gold);
  opacity: 0.4;
  line-height: 1;
  min-width: 38px;
  text-align: center;
  flex-shrink: 0;
}

.war-body {
  flex: 1;
  min-width: 0;
}

.war-name {
  font-family: 'Bebas Neue', sans-serif;
  font-size: clamp(17px, 3.5vw, 24px);
  color: var(--white);
  letter-spacing: 0.5px;
  line-height: 1.15;
}

.war-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
  font-size: 12px;
  color: rgba(255, 215, 0, 0.6);
  font-style: italic;
  align-items: center;
}

.meta-sep {
  opacity: 0.4;
}

.war-badge {
  background: var(--red);
  color: var(--gold);
  font-family: 'Bebas Neue', sans-serif;
  font-size: 11px;
  letter-spacing: 1.5px;
  padding: 4px 10px;
  border-radius: 3px;
  white-space: nowrap;
  align-self: center;
  flex-shrink: 0;
  border: 1px solid rgba(255, 215, 0, 0.25);
}
</style>
