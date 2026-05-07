<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'

const props = defineProps<{
  value: number | null
  rolling: boolean
}>()

const emit = defineEmits<{ roll: [] }>()

// ─── DOM ref ─────────────────────────────────────────────────────────────────
const canvasEl = ref<HTMLCanvasElement | null>(null)

// ─── Three.js handles ────────────────────────────────────────────────────────
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let die: THREE.Mesh | null = null
let shadowPlane: THREE.Mesh | null = null
let rafId: number | null = null
let resizeObserver: ResizeObserver | null = null

// ─── Animation state ─────────────────────────────────────────────────────────
let rollStartTime = 0
const rollDuration = 1400
let isAnimatingRoll = false
let isSettling = false
let settleStartTime = 0
const settleDuration = 700
let rollAxisX = 1
let rollAxisZ = 0
const accumulatedQuat = new THREE.Quaternion()
const targetQuat = new THREE.Quaternion()
const settleStartQuat = new THREE.Quaternion()

// ─── Canvas texture ──────────────────────────────────────────────────────────
function makeNumberTexture(num: number | null): THREE.CanvasTexture {
  const size = 512
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!

  // Navy background
  ctx.fillStyle = '#00174A'
  ctx.fillRect(0, 0, size, size)

  // Outer gold border
  const bw = 26
  ctx.strokeStyle = '#B8860B'
  ctx.lineWidth = bw
  ctx.strokeRect(bw / 2, bw / 2, size - bw, size - bw)

  // Inner thin border
  ctx.strokeStyle = 'rgba(255,215,0,0.3)'
  ctx.lineWidth = 5
  ctx.strokeRect(bw + 12, bw + 12, size - (bw + 12) * 2, size - (bw + 12) * 2)

  // Corner stars
  ;[
    [52, 52], [size - 52, 52],
    [52, size - 52], [size - 52, size - 52],
  ].forEach(([cx, cy]) => drawStar(ctx, cx, cy, 16, 6.5, '#8B6914'))

  if (num !== null) {
    const text = String(num)
    const fontSize = text.length >= 3 ? 160 : text.length === 2 ? 200 : 230

    ctx.save()
    ctx.shadowColor = 'rgba(255,200,0,0.6)'
    ctx.shadowBlur = 24
    ctx.font = `900 ${fontSize}px "Arial Black", "Liberation Sans", Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Dark emboss shadow
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fillText(text, size / 2 + 5, size / 2 + 6)

    // Gold gradient fill
    const grad = ctx.createLinearGradient(0, size * 0.25, 0, size * 0.8)
    grad.addColorStop(0, '#FFF0A0')
    grad.addColorStop(0.3, '#FFD700')
    grad.addColorStop(1, '#8B6914')
    ctx.fillStyle = grad
    ctx.fillText(text, size / 2, size / 2)

    // Specular highlight
    ctx.globalAlpha = 0.14
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, size / 2 - 2, size / 2 - 3)
    ctx.globalAlpha = 1.0
    ctx.restore()
  } else {
    // Idle face — just stars pattern
    const positions = [
      [size/2, size/2],
      [size*0.28, size*0.28], [size*0.72, size*0.28],
      [size*0.28, size*0.72], [size*0.72, size*0.72],
    ]
    positions.forEach(([cx, cy]) => drawStar(ctx, cx, cy, 28, 11, 'rgba(255,215,0,0.18)'))
  }

  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  ro: number, ri: number,
  color: string
) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2
    const r = i % 2 === 0 ? ro : ri
    i === 0
      ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
      : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// ─── Side face texture ───────────────────────────────────────────────────────
function makeSideTexture(): THREE.CanvasTexture {
  const size = 512
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!

  ctx.fillStyle = '#00174A'
  ctx.fillRect(0, 0, size, size)

  const bw = 26
  ctx.strokeStyle = '#6B4F0A'
  ctx.lineWidth = bw
  ctx.strokeRect(bw / 2, bw / 2, size - bw, size - bw)

  // Subtle star watermark
  drawStar(ctx, size / 2, size / 2, 80, 32, 'rgba(255,215,0,0.07)')

  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

// ─── Update front face ───────────────────────────────────────────────────────
function updateFrontFace(value: number | null) {
  if (!die) return
  const mats = die.material as THREE.MeshStandardMaterial[]
  const front = mats[4] // +Z face = front
  front.map?.dispose()
  front.map = makeNumberTexture(value)
  front.needsUpdate = true
}

// ─── Procedural env map ──────────────────────────────────────────────────────
function buildEnvMap(): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer!)
  pmrem.compileEquirectangularShader()
  const size = 64
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = y / size
      const i = (y * size + x) * 4
      data[i]   = Math.floor(t * 30)
      data[i+1] = Math.floor(t * 50)
      data[i+2] = Math.floor(70 + t * 80)
      data[i+3] = 255
    }
  }
  const dt = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  dt.mapping = THREE.EquirectangularReflectionMapping
  dt.needsUpdate = true
  const env = pmrem.fromEquirectangular(dt).texture
  dt.dispose()
  pmrem.dispose()
  return env
}

// ─── Build die mesh ──────────────────────────────────────────────────────────
function buildDie(): THREE.Mesh {
  const geo = new THREE.BoxGeometry(2, 2, 2)

  const sideTex = makeSideTexture()

  // BoxGeometry face order: +X, -X, +Y, -Y, +Z (front), -Z (back)
  const materials: THREE.MeshStandardMaterial[] = [
    // +X right
    new THREE.MeshStandardMaterial({ map: sideTex.clone(), color: 0x00174a, metalness: 0.2, roughness: 0.1 }),
    // -X left
    new THREE.MeshStandardMaterial({ map: sideTex.clone(), color: 0x00174a, metalness: 0.2, roughness: 0.1 }),
    // +Y top
    new THREE.MeshStandardMaterial({ map: sideTex.clone(), color: 0x00174a, metalness: 0.2, roughness: 0.1 }),
    // -Y bottom
    new THREE.MeshStandardMaterial({ map: sideTex.clone(), color: 0x00174a, metalness: 0.2, roughness: 0.1 }),
    // +Z front — this is the number face
    new THREE.MeshStandardMaterial({ map: makeNumberTexture(null), color: 0x00174a, metalness: 0.2, roughness: 0.1 }),
    // -Z back
    new THREE.MeshStandardMaterial({ map: sideTex.clone(), color: 0x00174a, metalness: 0.2, roughness: 0.1 }),
  ]

  sideTex.dispose()

  const mesh = new THREE.Mesh(geo, materials)
  mesh.castShadow = true
  return mesh
}

// ─── Init scene ──────────────────────────────────────────────────────────────
function initScene() {
  const canvas = canvasEl.value!
  const w = canvas.clientWidth || 200
  const h = canvas.clientHeight || 200

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setSize(w, h, false)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.outputColorSpace = THREE.SRGBColorSpace

  scene = new THREE.Scene()

  camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 100)
  camera.position.set(0, 1.2, 6.8)
  camera.lookAt(0, 0, 0)

  // Env
  scene.environment = buildEnvMap()

  // Ambient
  scene.add(new THREE.AmbientLight(0x1a2a55, 0.7))

  // Key — warm, upper-left
  const key = new THREE.DirectionalLight(0xfff6e0, 4.0)
  key.position.set(-3, 6, 4)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 20
  key.shadow.camera.left = key.shadow.camera.bottom = -4
  key.shadow.camera.right = key.shadow.camera.top = 4
  key.shadow.bias = -0.002
  scene.add(key)

  // Fill — cool blue right
  const fill = new THREE.DirectionalLight(0x3355bb, 1.0)
  fill.position.set(4, 1, 3)
  scene.add(fill)

  // Rim — gold backlight
  const rim = new THREE.DirectionalLight(0xffd700, 2.0)
  rim.position.set(0.5, -1, -5)
  scene.add(rim)

  // Top bounce
  const top = new THREE.DirectionalLight(0xffffff, 0.4)
  top.position.set(0, 8, 1)
  scene.add(top)

  // Die
  die = buildDie()
  scene.add(die)

  // Shadow plane
  shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.ShadowMaterial({ opacity: 0.4 })
  )
  shadowPlane.rotation.x = -Math.PI / 2
  shadowPlane.position.y = -1.55
  shadowPlane.receiveShadow = true
  scene.add(shadowPlane)

  // Resize
  resizeObserver = new ResizeObserver(onResize)
  resizeObserver.observe(canvas)

  loop()
}

// ─── Resize ──────────────────────────────────────────────────────────────────
function onResize() {
  const canvas = canvasEl.value
  if (!canvas || !renderer || !camera) return
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

// ─── Roll / settle triggers ───────────────────────────────────────────────────
function triggerRoll() {
  if (!die) return
  isSettling = false
  isAnimatingRoll = true
  rollStartTime = performance.now()
  accumulatedQuat.copy(die.quaternion)
  rollAxisX = (Math.random() - 0.5) * 2
  rollAxisZ = (Math.random() - 0.5) * 2
}

function triggerSettle() {
  if (!die) return
  isAnimatingRoll = false
  isSettling = true
  settleStartTime = performance.now()
  settleStartQuat.copy(die.quaternion)
  targetQuat.identity()
}

// ─── Render loop ─────────────────────────────────────────────────────────────
function loop() {
  rafId = requestAnimationFrame(loop)
  if (!renderer || !scene || !camera || !die) return

  const now = performance.now()

  if (isAnimatingRoll) {
    const t = Math.min((now - rollStartTime) / rollDuration, 1)
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    const axis = new THREE.Vector3(rollAxisX, 1.2, rollAxisZ).normalize()
    const spin = new THREE.Quaternion().setFromAxisAngle(axis, ease * Math.PI * 7)
    die.quaternion.copy(accumulatedQuat).premultiply(spin)
    if (t >= 1) triggerSettle()

  } else if (isSettling) {
    const t = Math.min((now - settleStartTime) / settleDuration, 1)
    // Spring overshoot
    const ease = t === 1 ? 1
      : 1 - Math.pow(2, -10 * t) * Math.cos((t * 10 - 0.75) * ((2 * Math.PI) / 4.5))
    die.quaternion.slerpQuaternions(settleStartQuat, targetQuat, Math.min(ease, 1))
    if (t >= 1) { isSettling = false; die.quaternion.copy(targetQuat) }

  } else {
    // Idle float
    const it = now * 0.0005
    die.rotation.y = Math.sin(it) * 0.09
    die.rotation.x = Math.sin(it * 0.7) * 0.05
    die.position.y = Math.sin(it * 1.2) * 0.07
  }

  renderer.render(scene, camera)
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
function cleanup() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  resizeObserver?.disconnect(); resizeObserver = null

  if (die) {
    die.geometry.dispose()
    ;(die.material as THREE.MeshStandardMaterial[]).forEach(m => {
      m.map?.dispose(); m.dispose()
    })
    scene?.remove(die); die = null
  }
  if (shadowPlane) {
    shadowPlane.geometry.dispose()
    ;(shadowPlane.material as THREE.Material).dispose()
    scene?.remove(shadowPlane); shadowPlane = null
  }

  scene?.environment?.dispose()
  scene?.clear(); scene = null
  renderer?.dispose(); renderer?.forceContextLoss(); renderer = null
  camera = null
}

// ─── Watchers ────────────────────────────────────────────────────────────────
watch(() => props.rolling, val => { if (val) triggerRoll() })
watch(() => props.value, val => {
  updateFrontFace(val)
  if (!props.rolling && val !== null) triggerSettle()
})

onMounted(initScene)
onBeforeUnmount(cleanup)
</script>

<template>
  <div class="die-wrapper">
    <canvas
      ref="canvasEl"
      class="die-canvas"
      :class="{ rolling, clickable: !rolling }"
      @click="!rolling && $emit('roll')"
      role="button"
      :aria-label="value ? `Die showing ${value}. Click to roll.` : 'Click to roll the die'"
      tabindex="0"
      @keydown.enter="!rolling && $emit('roll')"
      @keydown.space.prevent="!rolling && $emit('roll')"
    />
    <p class="die-hint" :class="{ faded: rolling }">
      {{ value === null ? 'Click to roll' : 'Click to re-roll' }}
    </p>
  </div>
</template>

<style scoped>
.die-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 12px;
  gap: 8px;
}

.die-canvas {
  width: 200px;
  height: 200px;
  display: block;
  border-radius: 10px;
  outline: none;
  transition: filter 0.25s ease, transform 0.2s ease;
}

@media (max-width: 480px) {
  .die-canvas { width: 160px; height: 160px; }
}

.die-canvas.clickable { cursor: pointer; }
.die-canvas.rolling   { cursor: not-allowed; }

.die-canvas.clickable:hover {
  filter: brightness(1.1) drop-shadow(0 0 20px rgba(255,215,0,0.5));
  transform: translateY(-4px);
}
.die-canvas.clickable:active { transform: translateY(1px); }

.die-hint {
  font-family: 'Special Elite', cursive;
  font-size: 12px;
  color: rgba(255, 215, 0, 0.4);
  letter-spacing: 1px;
  margin: 0;
  transition: opacity 0.3s;
}
.die-hint.faded { opacity: 0; }
</style>
