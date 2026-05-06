<script setup lang="ts">
import NewsTicker from './components/NewsTicker.vue'
import GoldenDie from './components/GoldenDie.vue'
import WarCard from './components/WarCard.vue'
import { useWars } from './composables/useWars'

const { dieValue, wars, quote, isRolling, hasRolled, warCount, roll } = useWars()
</script>

<template>
  <div class="app">
    <NewsTicker />

    <header class="site-header">
      <div class="eagle" aria-hidden="true">🦅</div>
      <h1 class="site-title">WARS<br>ENDED™</h1>
      <div class="stars" aria-hidden="true">★ ★ ★ ★ ★</div>
      <p class="site-subtitle">
        An Official-ish Tracker of Totally Real Conflicts<br>
        That Were Definitely Happening
      </p>
      <p class="disclaimer">
        * Satire. All wars, countries, quotes, and geopolitical events are completely fabricated.
        Any resemblance to actual foreign policy is genuinely concerning.
      </p>
    </header>

    <div class="divider" />

    <main class="main">

      <!-- ROLL SECTION -->
      <section class="roll-section">
        <p class="roll-instruction">
          Roll to find out how many wars<br>were ended <em>this week</em> 👇
        </p>

        <GoldenDie :value="dieValue" :rolling="isRolling" @roll="roll" />

        <button class="roll-btn" :disabled="isRolling" @click="roll">
          🎲 ROLL THE DIE
        </button>
        <p class="roll-sub">Results may vary. Offer void in Flargistan.</p>
      </section>

      <!-- COUNT BANNER -->
      <Transition name="pop">
        <div v-if="hasRolled" class="count-banner">
          <div class="count-number">{{ warCount }}</div>
          <div class="count-label">WARS ENDED — POSSIBLY MORE</div>
        </div>
      </Transition>

      <!-- PRESIDENTIAL QUOTE -->
      <Transition name="slide-up">
        <div v-if="hasRolled && quote" class="quote-box">
          <div class="quote-tag">📢 OFFICIAL STATEMENT</div>
          <blockquote class="quote-text">"{{ quote }}"</blockquote>
          <div class="quote-attr">— The President, probably at a golf course</div>
        </div>
      </Transition>

      <div v-if="hasRolled" class="divider" />

      <!-- WAR LIST -->
      <Transition name="fade">
        <section v-if="wars.length" class="wars-section">
          <h2 class="wars-header">⚔️ CONFLICTS HEROICALLY CONCLUDED ⚔️</h2>
          <TransitionGroup name="war-list" tag="div" class="war-list">
            <WarCard
              v-for="(war, i) in wars"
              :key="war.id"
              :war="war"
              :index="i"
            />
          </TransitionGroup>
        </section>
      </Transition>

    </main>

    <footer class="site-footer">
      <p>This website is satire and does not reflect real events, real wars, real countries, or real foreign policy.</p>
      <p>If any of these war names coincidentally match real places, that is between you and the universe.</p>
      <p class="footer-copy">© WARS ENDED LLC · Covfefe, USA · Tremendous, Very Legal, Very Cool</p>
    </footer>
  </div>
</template>

<style scoped>
.site-header {
  text-align: center;
  padding: 48px 20px 24px;
}

.eagle {
  font-size: 64px;
  line-height: 1;
  display: block;
  filter: drop-shadow(0 0 24px rgba(255,215,0,0.45));
  animation: bob 3.5s ease-in-out infinite;
}

@keyframes bob {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50%       { transform: translateY(-10px) rotate(2deg); }
}

.site-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: clamp(56px, 13vw, 110px);
  color: var(--gold);
  text-shadow:
    4px 4px 0 var(--dark-gold),
    8px 8px 0 rgba(0, 0, 0, 0.35);
  letter-spacing: 4px;
  line-height: 0.88;
  margin: 12px 0 10px;
}

.stars {
  font-size: 16px;
  letter-spacing: 8px;
  color: var(--gold);
  opacity: 0.55;
  margin-bottom: 12px;
}

.site-subtitle {
  font-family: 'Special Elite', cursive;
  font-size: clamp(14px, 3vw, 20px);
  color: var(--cream);
  opacity: 0.82;
  line-height: 1.5;
  margin-bottom: 12px;
}

.disclaimer {
  font-size: 11px;
  color: rgba(255,255,255,0.35);
  font-style: italic;
  max-width: 520px;
  margin: 0 auto;
  line-height: 1.6;
}

.main {
  max-width: 860px;
  margin: 0 auto;
  padding: 16px 20px 40px;
}

/* ROLL SECTION */
.roll-section {
  text-align: center;
  margin-bottom: 32px;
}

.roll-instruction {
  font-family: 'Permanent Marker', cursive;
  font-size: clamp(17px, 4vw, 26px);
  color: var(--cream);
  margin-bottom: 24px;
  display: inline-block;
  transform: rotate(-1deg);
  line-height: 1.4;
}

.roll-btn {
  display: block;
  margin: 0 auto 10px;
  background: linear-gradient(145deg, #DD0000 0%, #990000 100%);
  color: var(--gold);
  font-family: 'Bebas Neue', sans-serif;
  font-size: 28px;
  letter-spacing: 3px;
  border: 3px solid var(--gold);
  padding: 12px 52px;
  cursor: pointer;
  border-radius: 5px;
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
  box-shadow: 0 5px 24px rgba(0,0,0,0.45), 0 0 24px rgba(204,0,0,0.25);
}

.roll-btn:not(:disabled):hover {
  background: linear-gradient(145deg, #EE0000 0%, #AA0000 100%);
  transform: translateY(-3px);
  box-shadow: 0 8px 28px rgba(0,0,0,0.55), 0 0 36px rgba(204,0,0,0.35);
}

.roll-btn:not(:disabled):active {
  transform: translateY(1px);
}

.roll-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.roll-sub {
  font-size: 11px;
  color: rgba(255,255,255,0.28);
  font-style: italic;
}

/* COUNT BANNER */
.count-banner {
  background: linear-gradient(135deg, var(--gold), var(--dark-gold));
  color: var(--navy);
  padding: 18px 36px;
  border-radius: 8px;
  margin: 0 0 24px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 40px rgba(255,215,0,0.15);
}

.count-number {
  font-family: 'Bebas Neue', sans-serif;
  font-size: clamp(56px, 12vw, 90px);
  line-height: 1;
  text-shadow: 3px 3px 0 rgba(0,0,0,0.15);
}

.count-label {
  font-family: 'Bebas Neue', sans-serif;
  font-size: clamp(18px, 4vw, 30px);
  letter-spacing: 3px;
  opacity: 0.8;
}

/* QUOTE BOX */
.quote-box {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,215,0,0.25);
  border-left: 8px solid var(--gold);
  padding: 20px 26px;
  border-radius: 4px;
  margin-bottom: 28px;
}

.quote-tag {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 11px;
  letter-spacing: 3px;
  color: var(--gold);
  opacity: 0.65;
  margin-bottom: 10px;
}

.quote-text {
  font-family: 'Special Elite', cursive;
  font-size: clamp(14px, 2.8vw, 18px);
  line-height: 1.7;
  color: var(--cream);
  font-style: italic;
  margin: 0;
}

.quote-attr {
  margin-top: 12px;
  font-size: 12px;
  color: rgba(255,215,0,0.55);
  text-align: right;
  letter-spacing: 0.5px;
}

/* WARS SECTION */
.wars-header {
  font-family: 'Bebas Neue', sans-serif;
  font-size: clamp(20px, 4vw, 30px);
  letter-spacing: 4px;
  color: var(--gold);
  border-bottom: 2px solid rgba(255,215,0,0.2);
  padding-bottom: 14px;
  margin-bottom: 20px;
  text-align: center;
}

.war-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* FOOTER */
.site-footer {
  text-align: center;
  padding: 40px 20px 48px;
  font-family: 'Special Elite', cursive;
  font-size: 12px;
  color: rgba(255,255,255,0.22);
  line-height: 2;
  border-top: 1px solid rgba(255,215,0,0.1);
}

.footer-copy {
  margin-top: 8px;
  opacity: 0.5;
  font-size: 11px;
}

/* TRANSITIONS */
.pop-enter-active { animation: pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
.pop-leave-active { animation: pop-in 0.25s ease reverse; }
@keyframes pop-in {
  from { transform: scale(0.6); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

.slide-up-enter-active { transition: all 0.4s ease; }
.slide-up-leave-active { transition: all 0.25s ease; }
.slide-up-enter-from  { transform: translateY(20px); opacity: 0; }
.slide-up-leave-to    { transform: translateY(-10px); opacity: 0; }

.fade-enter-active { transition: opacity 0.4s ease 0.1s; }
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
