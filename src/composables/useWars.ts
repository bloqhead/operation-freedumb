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

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateWarName(): string {
  const adj = randomFrom(warAdjectives)
  const noun = randomFrom(warNouns)
  const country = randomFrom(fakePlaces)
  const country2 = randomFrom(fakePlaces.filter(p => p !== country))
  const roll = Math.random()
  if (roll < 0.33) return `The ${adj} ${noun} of ${country}`
  if (roll < 0.66) return `The ${country}–${country2} ${noun}`
  return `The ${adj} ${noun} Between ${country} and ${country2}`
}

function generateWar(index: number): War {
  const country1 = randomFrom(fakePlaces)
  const country2 = randomFrom(fakePlaces.filter(p => p !== country1))
  return {
    id: index,
    name: generateWarName(),
    country1,
    country2,
    badge: randomFrom(badgeOptions),
    duration: randomFrom(durations),
    casualties: randomFrom(casualties),
  }
}

export function useWars() {
  const dieValue = ref<number | null>(null)
  const wars = ref<War[]>([])
  const quote = ref('')
  const isRolling = ref(false)
  const hasRolled = ref(false)

  const warCount = computed(() => wars.value.length)

  function generateQuote() {
    const warName = generateWarName()
    const template = randomFrom(quotes)
    return template.replace(/\[WAR\]/g, warName)
  }

  async function roll() {
    if (isRolling.value) return
    isRolling.value = true

    // Flash the die with random values
    const result = Math.floor(Math.random() * 6) + 1
    let flashes = 0
    const flashInterval = setInterval(() => {
      dieValue.value = Math.floor(Math.random() * 6) + 1
      flashes++
    }, 80)

    await new Promise(resolve => setTimeout(resolve, 700))
    clearInterval(flashInterval)

    dieValue.value = result
    isRolling.value = false
    hasRolled.value = true

    // Stagger war generation for animation effect
    wars.value = []
    quote.value = generateQuote()

    for (let i = 0; i < result; i++) {
      await new Promise(resolve => setTimeout(resolve, 80))
      wars.value.push(generateWar(i))
    }
  }

  return {
    dieValue,
    wars,
    quote,
    isRolling,
    hasRolled,
    warCount,
    roll,
  }
}
