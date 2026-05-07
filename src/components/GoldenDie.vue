<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'

const props = defineProps<{
  value: number | null
  rolling: boolean
}>()

defineEmits<{ roll: [] }>()

const canvasEl = ref<HTMLCanvasElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let dieGroup: THREE.Group | null = null
let shadowPlane: THREE.Mesh | null = null
let rafId: number | null = null
let resizeObserver: ResizeObserver | null = null
let frontMat: THREE.MeshStandardMaterial | null = null

let isAnimatingRoll = false
let isSettling = false
let rollStartTime = 0
let settleStartTime = 0
const rollDuration = 1300
const settleDuration = 650
let rollAxisX = 1
let rollAxisZ = 0
const accumulatedQuat = new THREE.Quaternion()
const targetQuat = new THREE.Quaternion()
const settleStartQuat = new THREE.Quaternion()

// ─── Face texture ─────────────────────────────────────────────────────────────
function makeNumberTexture(num: number | null): THREE.CanvasTexture {
  const size = 512
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')!

  // Rich red radial gradient
  const bg = ctx.createRadialGradient(size * 0.38, size * 0.32, 0, size / 2, size / 2, size * 0.72)
  bg.addColorStop(0, '#D42200')
  bg.addColorStop(0.55, '#AA1600')
  bg.addColorStop(1, '#700D00')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)

  // Gold border
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 24
  ctx.strokeRect(12, 12, size - 24, size - 24)
  ctx.strokeStyle = 'rgba(255,220,80,0.3)'
  ctx.lineWidth = 4
  ctx.strokeRect(42, 42, size - 84, size - 84)

  // Corner stars
  ;[[52, 52], [size - 52, 52], [52, size - 52], [size - 52, size - 52]].forEach(([cx, cy]) =>
    drawStar(ctx, cx, cy, 16, 6.5, '#FFD700')
  )

  if (num !== null) {
    const text = String(num)
    const fontSize = text.length >= 3 ? 175 : text.length === 2 ? 215 : 248
    ctx.save()
    ctx.font = `900 ${fontSize}px "Arial Black", Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // Emboss shadow
    ctx.fillStyle = 'rgba(0,0,0,0.85)'
    ctx.fillText(text, size / 2 + 5, size / 2 + 7)
    // Gold gradient
    const g = ctx.createLinearGradient(0, size * 0.18, 0, size * 0.88)
    g.addColorStop(0, '#FFEE88')
    g.addColorStop(0.3, '#FFD700')
    g.addColorStop(0.8, '#CC9900')
    g.addColorStop(1, '#8B6400')
    ctx.fillStyle = g
    ctx.fillText(text, size / 2, size / 2)
    // Specular highlight
    ctx.globalAlpha = 0.13
    ctx.fillStyle = '#fff'
    ctx.fillText(text, size / 2 - 3, size / 2 - 4)
    ctx.globalAlpha = 1
    ctx.restore()
  } else {
    // Idle: subtle star pattern
    ;[[size / 2, size / 2], [size * .3, size * .3], [size * .7, size * .3], [size * .3, size * .7], [size * .7, size * .7]]
      .forEach(([cx, cy]) => drawStar(ctx, cx, cy, 28, 11, 'rgba(255,215,0,0.12)'))
  }

  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

function makeSideTexture(): THREE.CanvasTexture {
  const size = 256
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')!
  const bg = ctx.createRadialGradient(size * 0.38, size * 0.35, 0, size / 2, size / 2, size * 0.72)
  bg.addColorStop(0, '#C42000')
  bg.addColorStop(0.6, '#9A1400')
  bg.addColorStop(1, '#650C00')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = '#AA8800'
  ctx.lineWidth = 12
  ctx.strokeRect(6, 6, size - 12, size - 12)
  drawStar(ctx, size / 2, size / 2, size * 0.18, size * 0.07, 'rgba(255,215,0,0.1)')
  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, ro: number, ri: number, color: string) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5 - Math.PI / 2
    const r = i % 2 === 0 ? ro : ri
    i === 0
      ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
      : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function updateFrontFace(value: number | null) {
  if (!frontMat) return
  frontMat.map?.dispose()
  frontMat.map = makeNumberTexture(value)
  frontMat.needsUpdate = true
}

// ─── Build die: rounded body (sphere-morph trick) + face decals ───────────────
function buildDie(): THREE.Group {
  const group = new THREE.Group()

  // Rounded body: use a SphereGeometry and scale it to look like a rounded cube
  // This is the simplest possible approach with no custom geo code
  const bodyGeo = new THREE.SphereGeometry(1.18, 32, 32)

  // Scale non-uniformly to squish into cube-like shape
  // Then use a box for the actual shadow-casting shape
  bodyGeo.scale(1.0, 1.0, 1.0)

  // Better: use BoxGeometry with subdivision and displace toward sphere
  const seg = 12
  const boxGeo = new THREE.BoxGeometry(2, 2, 2, seg, seg, seg)
  const pos = boxGeo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    // Lerp each vertex between box surface and sphere surface
    const len = Math.sqrt(x * x + y * y + z * z)
    const sphereX = x / len, sphereY = y / len, sphereZ = z / len
    const t = 0.18 // blend factor — controls roundness
    pos.setXYZ(i,
      x + (sphereX - x) * t,
      y + (sphereY - y) * t,
      z + (sphereZ - z) * t
    )
  }
  boxGeo.computeVertexNormals()
  bodyGeo.dispose()

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xAA1600,
    metalness: 0.3,
    roughness: 0.18,
    envMapIntensity: 1.0,
  })

  const body = new THREE.Mesh(boxGeo, bodyMat)
  body.castShadow = true
  group.add(body)

  // Front face decal — PlaneGeometry floating just above +Z face
  frontMat = new THREE.MeshStandardMaterial({
    map: makeNumberTexture(null),
    metalness: 0.05,
    roughness: 0.25,
    transparent: false,
  })
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), frontMat)
  face.position.z = 1.02
  group.add(face)

  // Side decals for the other 5 faces (non-number faces)
  const sideMat = new THREE.MeshStandardMaterial({
    map: makeSideTexture(),
    metalness: 0.05,
    roughness: 0.25,
  })
  const sidePositions: [number, number, number, number, number][] = [
    [0, 0, -1.02, 0, Math.PI],          // back
    [0,  1.02, 0, -Math.PI / 2, 0],     // top
    [0, -1.02, 0,  Math.PI / 2, 0],     // bottom
    [ 1.02, 0, 0, 0,  Math.PI / 2],     // right
    [-1.02, 0, 0, 0, -Math.PI / 2],     // left
  ]
  sidePositions.forEach(([x, y, z, rx, ry]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), sideMat)
    m.position.set(x, y, z)
    m.rotation.set(rx, ry, 0)
    group.add(m)
  })

  return group
}

// ─── Env map ──────────────────────────────────────────────────────────────────
function buildEnvMap(): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer!)
  pmrem.compileEquirectangularShader()
  const size = 64
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = y / size
      const i = (y * size + x) * 4
      data[i]     = Math.floor(80 + t * 60)
      data[i + 1] = Math.floor(30 + t * 20)
      data[i + 2] = Math.floor(10 + t * 10)
      data[i + 3] = 255
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

// ─── Scene ────────────────────────────────────────────────────────────────────
function initScene() {
  const canvas = canvasEl.value!
  const w = canvas.clientWidth || 220
  const h = canvas.clientHeight || 220

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setSize(w, h, false)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  renderer.outputColorSpace = THREE.SRGBColorSpace

  scene = new THREE.Scene()

  camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 100)
  camera.position.set(0, 1.4, 6.8)
  camera.lookAt(0, 0, 0)

  scene.environment = buildEnvMap()

  scene.add(new THREE.AmbientLight(0xffeedd, 1.5))

  const key = new THREE.DirectionalLight(0xffffff, 5.5)
  key.position.set(-3, 7, 5)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 20
  key.shadow.camera.left = key.shadow.camera.bottom = -4
  key.shadow.camera.right = key.shadow.camera.top = 4
  key.shadow.bias = -0.002
  scene.add(key)

  const fill = new THREE.DirectionalLight(0xffddaa, 2.2)
  fill.position.set(5, 2, 3)
  scene.add(fill)

  const rim = new THREE.DirectionalLight(0xffd700, 2.8)
  rim.position.set(0.5, -0.5, -6)
  scene.add(rim)

  const top = new THREE.DirectionalLight(0xffffff, 1.0)
  top.position.set(0, 8, 2)
  scene.add(top)

  dieGroup = buildDie()
  scene.add(dieGroup)

  shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.ShadowMaterial({ opacity: 0.4 })
  )
  shadowPlane.rotation.x = -Math.PI / 2
  shadowPlane.position.y = -1.55
  shadowPlane.receiveShadow = true
  scene.add(shadowPlane)

  resizeObserver = new ResizeObserver(onResize)
  resizeObserver.observe(canvas)
  loop()
}

function onResize() {
  const canvas = canvasEl.value
  if (!canvas || !renderer || !camera) return
  const w = canvas.clientWidth, h = canvas.clientHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

function triggerRoll() {
  if (!dieGroup) return
  isSettling = false
  isAnimatingRoll = true
  rollStartTime = performance.now()
  accumulatedQuat.copy(dieGroup.quaternion)
  rollAxisX = (Math.random() - 0.5) * 2
  rollAxisZ = (Math.random() - 0.5) * 2
}

function triggerSettle() {
  if (!dieGroup) return
  isAnimatingRoll = false
  isSettling = true
  settleStartTime = performance.now()
  settleStartQuat.copy(dieGroup.quaternion)
  targetQuat.identity()
}

function loop() {
  rafId = requestAnimationFrame(loop)
  if (!renderer || !scene || !camera || !dieGroup) return
  const now = performance.now()

  if (isAnimatingRoll) {
    const t = Math.min((now - rollStartTime) / rollDuration, 1)
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    const axis = new THREE.Vector3(rollAxisX, 1.2, rollAxisZ).normalize()
    dieGroup.quaternion.copy(accumulatedQuat).premultiply(
      new THREE.Quaternion().setFromAxisAngle(axis, ease * Math.PI * 7)
    )
    if (t >= 1) triggerSettle()

  } else if (isSettling) {
    const t = Math.min((now - settleStartTime) / settleDuration, 1)
    const ease = t === 1 ? 1 : 1 - Math.pow(2, -10 * t) * Math.cos((t * 10 - 0.75) * (2 * Math.PI / 4.5))
    dieGroup.quaternion.slerpQuaternions(settleStartQuat, targetQuat, Math.min(ease, 1))
    if (t >= 1) { isSettling = false; dieGroup.quaternion.copy(targetQuat) }

  } else {
    const it = now * 0.0005
    dieGroup.rotation.y = Math.sin(it) * 0.09
    dieGroup.rotation.x = Math.sin(it * 0.7) * 0.05
    dieGroup.position.y = Math.sin(it * 1.2) * 0.07
  }

  renderer.render(scene, camera)
}

function cleanup() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  resizeObserver?.disconnect(); resizeObserver = null

  if (dieGroup) {
    dieGroup.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        ;(mats as THREE.MeshStandardMaterial[]).forEach(m => { m.map?.dispose(); m.dispose() })
      }
    })
    scene?.remove(dieGroup)
    dieGroup = null
    frontMat = null
  }

  if (shadowPlane) {
    shadowPlane.geometry.dispose()
    ;(shadowPlane.material as THREE.Material).dispose()
    scene?.remove(shadowPlane)
    shadowPlane = null
  }

  scene?.environment?.dispose()
  scene?.clear(); scene = null
  renderer?.dispose(); renderer?.forceContextLoss(); renderer = null
  camera = null
}

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
  width: 220px;
  height: 220px;
  display: block;
  border-radius: 12px;
  outline: none;
  transition: filter 0.25s ease, transform 0.2s ease;
}

@media (max-width: 480px) {
  .die-canvas { width: 170px; height: 170px; }
}

.die-canvas.clickable { cursor: pointer; }
.die-canvas.rolling   { cursor: not-allowed; }
.die-canvas.clickable:hover {
  filter: brightness(1.1) drop-shadow(0 0 22px rgba(255, 100, 50, 0.55));
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
