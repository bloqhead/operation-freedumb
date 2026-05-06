import { ref, computed } from 'vue'
import {
  warAdjectives,
  warNouns,
  fakePlaces,
  badgeOptions,
  quotes,
} from '../data/wars'

export interface War {
  id: number
  name: string
  country1: string
  country2: string
  badge: string
  duration: string
  casualties: string
}

const durations = [
  'Nobody knows', '400 years (approx)', 'Since Tuesday', 'Like, a while',
  'Started before I was born (so irrelevant)', 'Very long time, trust me',
  'Since the dinosaurs frankly', '3 weeks (felt longer)', 'Ongoing until I fixed it',
  'Since Obama. Sad.', 'Decades. Maybe centuries. Long.',
]

const casualties = [
  'Unclear but I heard "a lot"', 'Some. Not great, not terrible.',
  'Many, many people. Beautiful people.', 'Less than they\'re saying',
  'Classified (but huge)', 'Fewer than Fake News reported',
  'A tremendous number', 'I don\'t like to say', 'So many. Unbelievable.',
  'We don\'t talk about that', 'None since I got involved',
]

// Seeded pseudo-random number generator (mulberry32)
function createRng(seed: number) {
  return function () {
    seed |= 0
    seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function seededFrom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}

function generateWarName(rng: () => number): string {
  const adj = seededFrom(warAdjectives, rng)
  const noun = seededFrom(warNouns, rng)
  const country = seededFrom(fakePlaces, rng)
  const country2 = seededFrom(fakePlaces.filter(p => p !== country), rng)
  const roll = rng()
  if (roll < 0.33) return `The ${adj} ${noun} of ${country}`
  if (roll < 0.66) return `The ${country}–${country2} ${noun}`
  return `The ${adj} ${noun} Between ${country} and ${country2}`
}

function generateWar(index: number, rng: () => number): War {
  const country1 = seededFrom(fakePlaces, rng)
  const country2 = seededFrom(fakePlaces.filter(p => p !== country1), rng)
  return {
    id: index,
    name: generateWarName(rng),
    country1,
    country2,
    badge: seededFrom(badgeOptions, rng),
    duration: seededFrom(durations, rng),
    casualties: seededFrom(casualties, rng),
  }
}

function generateQuote(rng: () => number): string {
  const warName = generateWarName(rng)
  const template = seededFrom(quotes, rng)
  return template.replace(/\[WAR\]/g, warName)
}

function generateResultsFromSeed(seed: number, count: number) {
  const rng = createRng(seed)
  const quote = generateQuote(rng)
  const wars: War[] = []
  for (let i = 0; i < count; i++) {
    wars.push(generateWar(i, rng))
  }
  return { quote, wars }
}

function getUrlParams(): { seed: number; count: number } | null {
  const params = new URLSearchParams(window.location.search)
  const seed = params.get('seed')
  const count = params.get('count')
  if (seed && count) {
    const s = parseInt(seed, 10)
    const c = parseInt(count, 10)
    if (!isNaN(s) && !isNaN(c) && c >= 1 && c <= 6) {
      return { seed: s, count: c }
    }
  }
  return null
}

function setUrlParams(seed: number, count: number) {
  const url = new URL(window.location.href)
  url.searchParams.set('seed', String(seed))
  url.searchParams.set('count', String(count))
  window.history.pushState({}, '', url)
}

export function useWars() {
  const dieValue = ref<number | null>(null)
  const wars = ref<War[]>([])
  const quote = ref('')
  const isRolling = ref(false)
  const hasRolled = ref(false)
  const shareUrl = ref('')

  const warCount = computed(() => wars.value.length)

  function applyResults(seed: number, count: number, animate = false) {
    dieValue.value = count
    hasRolled.value = true
    setUrlParams(seed, count)
    shareUrl.value = window.location.href

    const results = generateResultsFromSeed(seed, count)
    quote.value = results.quote

    if (animate) {
      wars.value = []
      results.wars.forEach((war, i) => {
        setTimeout(() => { wars.value.push(war) }, i * 80)
      })
    } else {
      wars.value = results.wars
    }
  }

  // Restore from URL on init
  const urlParams = getUrlParams()
  if (urlParams) {
    applyResults(urlParams.seed, urlParams.count, false)
  }

  async function roll() {
    if (isRolling.value) return
    isRolling.value = true

    const seed = Math.floor(Math.random() * 2147483647)
    const count = Math.floor(Math.random() * 6) + 1

    const flashInterval = setInterval(() => {
      dieValue.value = Math.floor(Math.random() * 6) + 1
    }, 80)

    await new Promise(resolve => setTimeout(resolve, 700))
    clearInterval(flashInterval)

    isRolling.value = false
    applyResults(seed, count, true)
  }

  return {
    dieValue,
    wars,
    quote,
    isRolling,
    hasRolled,
    warCount,
    shareUrl,
    roll,
  }
}
