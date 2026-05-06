<script setup lang="ts">
import { tickerItems } from '../data/wars'

const ticker = [...tickerItems, ...tickerItems].join('  ★  ')
</script>

<template>
  <div class="ticker-wrap">
    <div class="ticker-label">⚡ BREAKING</div>
    <div class="ticker-track">
      <span class="ticker-content">{{ ticker }}</span>
    </div>
  </div>
</template>

<style scoped>
.ticker-wrap {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--red);
  border-top: 3px solid var(--gold);
  border-bottom: 3px solid var(--gold);
  display: flex;
  align-items: center;
  overflow: hidden;
  height: 38px;
}

.ticker-label {
  background: var(--gold);
  color: var(--navy);
  font-family: 'Bebas Neue', sans-serif;
  font-size: 13px;
  letter-spacing: 2px;
  padding: 0 14px;
  height: 100%;
  display: flex;
  align-items: center;
  white-space: nowrap;
  flex-shrink: 0;
  z-index: 2;
  border-right: 2px solid var(--dark-gold);
}

.ticker-track {
  overflow: hidden;
  flex: 1;
}

.ticker-content {
  display: inline-block;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: var(--cream);
  padding-left: 100%;
  animation: scroll-ticker 80s linear infinite;
}

@keyframes scroll-ticker {
  0% { transform: translateX(0); }
  100% { transform: translateX(-100%); }
}
</style>
