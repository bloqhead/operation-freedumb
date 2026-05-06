<script setup lang="ts">
defineProps<{
  value: number | null
  rolling: boolean
}>()

defineEmits<{
  roll: []
}>()
</script>

<template>
  <div class="die-wrapper">
    <div
      class="die"
      :class="{ rolling }"
      @click="$emit('roll')"
      role="button"
      aria-label="Roll the die"
    >
      <span class="die-face">{{ value ?? '?' }}</span>
    </div>
  </div>
</template>

<style scoped>
.die-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

.die {
  width: 130px;
  height: 130px;
  background: linear-gradient(145deg, #FFE44D 0%, #FFD700 45%, #B8860B 100%);
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 4px solid rgba(255, 255, 255, 0.25);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.6),
    inset 0 3px 8px rgba(255, 255, 255, 0.35),
    inset 0 -3px 8px rgba(0, 0, 0, 0.2),
    0 0 50px rgba(255, 215, 0, 0.15);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  user-select: none;
  position: relative;
  overflow: hidden;
}

.die::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 60%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
  transform: skewX(-20deg);
  transition: left 0.4s ease;
}

.die:hover::after { left: 150%; }

.die:hover {
  transform: translateY(-4px) rotate(3deg);
  box-shadow:
    0 14px 40px rgba(0, 0, 0, 0.7),
    inset 0 3px 8px rgba(255, 255, 255, 0.35),
    0 0 70px rgba(255, 215, 0, 0.25);
}

.die:active {
  transform: translateY(1px) rotate(-1deg);
}

.die-face {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 80px;
  color: var(--navy);
  line-height: 1;
  text-shadow: 2px 2px 0 rgba(0,0,0,0.15);
}

.die.rolling {
  animation: shake 0.65s cubic-bezier(0.36, 0.07, 0.19, 0.97);
  cursor: not-allowed;
}

@keyframes shake {
  0%   { transform: rotate(0deg)   scale(1); }
  12%  { transform: rotate(-22deg) scale(1.1); }
  25%  { transform: rotate(22deg)  scale(0.88); }
  37%  { transform: rotate(-16deg) scale(1.06); }
  50%  { transform: rotate(16deg)  scale(0.94); }
  62%  { transform: rotate(-8deg)  scale(1.03); }
  75%  { transform: rotate(8deg)   scale(0.97); }
  88%  { transform: rotate(-3deg)  scale(1.01); }
  100% { transform: rotate(0deg)   scale(1); }
}
</style>
