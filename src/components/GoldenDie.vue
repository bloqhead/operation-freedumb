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
// dieMesh removed
let shadowPlane: THREE.Mesh | null = null
let rafId: number | null = null
let resizeObserver: ResizeObserver | null = null

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

// ─── Rounded box via merged geometry ─────────────────────────────────────────
// Build a convincing rounded box by using a sphere for corners + boxes for edges/faces
function createRoundedBoxGeometry(w: number, h: number, d: number, r: number, seg: number): THREE.BufferGeometry {
  // We offset a SphereGeometry approach: iterate over grid on each face,
  // project onto rounded-box surface via SDF
  const geos: THREE.BufferGeometry[] = []

  const hw = w/2, hh = h/2, hd = d/2
  const ir = r // corner radius

  // 6 faces
  const faces = [
    { u: new THREE.Vector3(1,0,0), v: new THREE.Vector3(0,1,0), n: new THREE.Vector3(0,0,1),  off: new THREE.Vector3(0,0,hd)  },
    { u: new THREE.Vector3(-1,0,0),v: new THREE.Vector3(0,1,0), n: new THREE.Vector3(0,0,-1), off: new THREE.Vector3(0,0,-hd) },
    { u: new THREE.Vector3(1,0,0), v: new THREE.Vector3(0,0,1), n: new THREE.Vector3(0,1,0),  off: new THREE.Vector3(0,hh,0)  },
    { u: new THREE.Vector3(1,0,0), v: new THREE.Vector3(0,0,-1),n: new THREE.Vector3(0,-1,0), off: new THREE.Vector3(0,-hh,0) },
    { u: new THREE.Vector3(0,0,-1),v: new THREE.Vector3(0,1,0), n: new THREE.Vector3(1,0,0),  off: new THREE.Vector3(hw,0,0)  },
    { u: new THREE.Vector3(0,0,1), v: new THREE.Vector3(0,1,0), n: new THREE.Vector3(-1,0,0), off: new THREE.Vector3(-hw,0,0) },
  ]

  faces.forEach(face => {
    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const idxArr: number[] = []

    for (let iy = 0; iy <= seg; iy++) {
      for (let ix = 0; ix <= seg; ix++) {
        const s = (ix/seg - 0.5)
        const t = (iy/seg - 0.5)
        // Position on flat face
        const px = face.off.x + face.u.x*s*(w-2*ir) + face.v.x*t*(h-2*ir)
        const py = face.off.y + face.u.y*s*(w-2*ir) + face.v.y*t*(h-2*ir)
        const pz = face.off.z + face.u.z*s*(d-2*ir) + face.v.z*t*(d-2*ir)

        // Push out by radius along normal
        const fx = px + face.n.x * ir
        const fy = py + face.n.y * ir
        const fz = pz + face.n.z * ir

        positions.push(fx, fy, fz)
        normals.push(face.n.x, face.n.y, face.n.z)
        uvs.push(ix/seg, iy/seg)
      }
    }

    for (let iy = 0; iy < seg; iy++) {
      for (let ix = 0; ix < seg; ix++) {
        const a = iy*(seg+1) + ix
        const b = iy*(seg+1) + ix+1
        const c = (iy+1)*(seg+1) + ix+1
        const dd = (iy+1)*(seg+1) + ix
        idxArr.push(a,b,dd, b,c,dd)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3))
    geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2))
    geo.setIndex(idxArr)
    geos.push(geo)
  })

  // Build sphere corners
  const cornerOffsets = [
    [-1,-1,-1],[1,-1,-1],[-1,1,-1],[1,1,-1],
    [-1,-1, 1],[1,-1, 1],[-1,1, 1],[1,1, 1],
  ]
  cornerOffsets.forEach(([cx,cy,cz]) => {
    const sg = new THREE.SphereGeometry(ir, seg, seg, 0, Math.PI/2, 0, Math.PI/2)
    // Flip/mirror to match corner quadrant
    const pm = sg.attributes.position
    for (let i=0; i<pm.count; i++) {
      pm.setXYZ(i,
        pm.getX(i) * cx + cx*(hw-ir),
        pm.getY(i) * cy + cy*(hh-ir),
        pm.getZ(i) * cz + cz*(hd-ir)
      )
    }
    sg.computeVertexNormals()
    geos.push(sg)
  })

  // Build 12 edge cylinders
  const edges = [
    // Bottom edges
    { axis:'x', cx:0,    cy:-hh+ir, cz:-hd+ir, len:w-2*ir },
    { axis:'x', cx:0,    cy:-hh+ir, cz: hd-ir, len:w-2*ir },
    { axis:'x', cx:0,    cy: hh-ir, cz:-hd+ir, len:w-2*ir },
    { axis:'x', cx:0,    cy: hh-ir, cz: hd-ir, len:w-2*ir },
    { axis:'y', cx:-hw+ir,cy:0,     cz:-hd+ir, len:h-2*ir },
    { axis:'y', cx: hw-ir,cy:0,     cz:-hd+ir, len:h-2*ir },
    { axis:'y', cx:-hw+ir,cy:0,     cz: hd-ir, len:h-2*ir },
    { axis:'y', cx: hw-ir,cy:0,     cz: hd-ir, len:h-2*ir },
    { axis:'z', cx:-hw+ir,cy:-hh+ir,cz:0,      len:d-2*ir },
    { axis:'z', cx: hw-ir,cy:-hh+ir,cz:0,      len:d-2*ir },
    { axis:'z', cx:-hw+ir,cy: hh-ir,cz:0,      len:d-2*ir },
    { axis:'z', cx: hw-ir,cy: hh-ir,cz:0,      len:d-2*ir },
  ]

  edges.forEach(e => {
    const cg = new THREE.CylinderGeometry(ir, ir, e.len, seg, 1, true, 0, Math.PI/2)
    // Rotate to align with axis
    if (e.axis === 'x') cg.rotateZ(Math.PI/2)
    else if (e.axis === 'z') cg.rotateX(Math.PI/2)
    // Translate
    const pm2 = cg.attributes.position
    for (let i=0; i<pm2.count; i++) {
      pm2.setXYZ(i, pm2.getX(i)+e.cx, pm2.getY(i)+e.cy, pm2.getZ(i)+e.cz)
    }
    cg.computeVertexNormals()
    geos.push(cg)
  })

  const merged = mergeGeometries(geos)
  geos.forEach(g => g.dispose())
  return merged
}

// Simple geometry merge
function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry()
  let totalVerts = 0
  let totalIdx = 0
  for (const g of geos) {
    totalVerts += (g.attributes.position as THREE.BufferAttribute).count
    if (g.index) totalIdx += g.index.count
  }

  const positions = new Float32Array(totalVerts * 3)
  const normals   = new Float32Array(totalVerts * 3)
  const idxOut    = new Uint32Array(totalIdx)
  let vOffset = 0, iOffset = 0

  for (const g of geos) {
    const pos = g.attributes.position as THREE.BufferAttribute
    const nor = g.attributes.normal   as THREE.BufferAttribute
    for (let i=0; i<pos.count; i++) {
      positions[(vOffset+i)*3]   = pos.getX(i)
      positions[(vOffset+i)*3+1] = pos.getY(i)
      positions[(vOffset+i)*3+2] = pos.getZ(i)
      normals[(vOffset+i)*3]   = nor.getX(i)
      normals[(vOffset+i)*3+1] = nor.getY(i)
      normals[(vOffset+i)*3+2] = nor.getZ(i)
    }
    if (g.index) {
      const idx = g.index
      for (let i=0; i<idx.count; i++) idxOut[iOffset+i] = idx.getX(i) + vOffset
      iOffset += idx.count
    }
    vOffset += pos.count
  }

  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  out.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3))
  out.setIndex(new THREE.BufferAttribute(idxOut, 1))
  return out
}

// ─── Textures ─────────────────────────────────────────────────────────────────
function makeNumberTexture(num: number | null): THREE.CanvasTexture {
  const size = 512
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')!

  // Rich red radial gradient
  const bg = ctx.createRadialGradient(size*0.38, size*0.32, 0, size/2, size/2, size*0.72)
  bg.addColorStop(0, '#D42200')
  bg.addColorStop(0.55, '#AA1600')
  bg.addColorStop(1, '#700D00')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)

  // Gold border
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = 24
  ctx.strokeRect(12, 12, size-24, size-24)

  ctx.strokeStyle = 'rgba(255,220,80,0.3)'
  ctx.lineWidth = 4
  ctx.strokeRect(42, 42, size-84, size-84)

  // Corner stars
  ;[[52,52],[size-52,52],[52,size-52],[size-52,size-52]].forEach(([cx,cy]) =>
    drawStar(ctx, cx, cy, 16, 6.5, '#FFD700'))

  if (num !== null) {
    const text = String(num)
    const fontSize = text.length >= 3 ? 175 : text.length === 2 ? 215 : 248
    ctx.save()
    ctx.font = `900 ${fontSize}px "Arial Black", Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // Emboss shadow
    ctx.fillStyle = 'rgba(0,0,0,0.85)'
    ctx.fillText(text, size/2+5, size/2+7)
    // Gold
    const g = ctx.createLinearGradient(0, size*0.18, 0, size*0.88)
    g.addColorStop(0, '#FFEE88')
    g.addColorStop(0.3, '#FFD700')
    g.addColorStop(0.8, '#CC9900')
    g.addColorStop(1, '#8B6400')
    ctx.fillStyle = g
    ctx.fillText(text, size/2, size/2)
    // Specular
    ctx.globalAlpha = 0.13
    ctx.fillStyle = '#fff'
    ctx.fillText(text, size/2-3, size/2-4)
    ctx.globalAlpha = 1
    ctx.restore()
  } else {
    [[size/2,size/2],[size*.3,size*.3],[size*.7,size*.3],[size*.3,size*.7],[size*.7,size*.7]]
      .forEach(([cx,cy]) => drawStar(ctx, cx, cy, 28, 11, 'rgba(255,215,0,0.1)'))
  }

  const tex = new THREE.CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, ro: number, ri: number, color: string) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i=0; i<10; i++) {
    const a = i*Math.PI/5 - Math.PI/2
    const r = i%2===0 ? ro : ri
    i===0 ? ctx.moveTo(cx+r*Math.cos(a), cy+r*Math.sin(a))
           : ctx.lineTo(cx+r*Math.cos(a), cy+r*Math.sin(a))
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

let frontMat: THREE.MeshStandardMaterial | null = null

function updateFrontFace(value: number | null) {
  if (!frontMat) return
  frontMat.map?.dispose()
  frontMat.map = makeNumberTexture(value)
  frontMat.needsUpdate = true
}

// ─── Build die group ──────────────────────────────────────────────────────────
function buildDie(): THREE.Group {
  const group = new THREE.Group()

  // Rounded body — single material (red all over)
  const bodyGeo = createRoundedBoxGeometry(2, 2, 2, 0.2, 8)
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xAA1600,
    metalness: 0.3,
    roughness: 0.2,
    envMapIntensity: 1.0,
  })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.castShadow = true
  group.add(body)

  // Front face plane — sits just above the +Z face
  const facePlane = new THREE.PlaneGeometry(1.62, 1.62)
  frontMat = new THREE.MeshStandardMaterial({
    map: makeNumberTexture(null),
    metalness: 0.1,
    roughness: 0.2,
    transparent: false,
  })
  const face = new THREE.Mesh(facePlane, frontMat)
  face.position.z = 1.01
  group.add(face)

  // body ref not needed
  return group
}

// ─── Env map ──────────────────────────────────────────────────────────────────
function buildEnvMap(): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer!)
  pmrem.compileEquirectangularShader()
  const size = 64
  const data = new Uint8Array(size * size * 4)
  for (let y=0; y<size; y++) {
    for (let x=0; x<size; x++) {
      const t = y/size
      const i = (y*size+x)*4
      // Warm-toned env for red die
      data[i]   = Math.floor(80 + t*60)
      data[i+1] = Math.floor(30 + t*20)
      data[i+2] = Math.floor(10 + t*10)
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

// ─── Scene init ───────────────────────────────────────────────────────────────
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
  renderer.toneMappingExposure = 1.2
  renderer.outputColorSpace = THREE.SRGBColorSpace

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(36, w/h, 0.1, 100)
  camera.position.set(0, 1.4, 6.8)
  camera.lookAt(0, 0, 0)

  scene.environment = buildEnvMap()

  // Ambient
  scene.add(new THREE.AmbientLight(0xffeedd, 1.5))

  // Key light — bright warm, upper left
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

  // Fill — warm right
  const fill = new THREE.DirectionalLight(0xffddaa, 2.2)
  fill.position.set(5, 2, 3)
  scene.add(fill)

  // Rim — gold backlight
  const rim = new THREE.DirectionalLight(0xffd700, 2.8)
  rim.position.set(0.5, -0.5, -6)
  scene.add(rim)

  // Top
  scene.add(Object.assign(new THREE.DirectionalLight(0xffffff, 1.0), {
    position: new THREE.Vector3(0, 8, 2)
  }))

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
    const ease = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2
    const axis = new THREE.Vector3(rollAxisX, 1.2, rollAxisZ).normalize()
    dieGroup.quaternion.copy(accumulatedQuat).premultiply(
      new THREE.Quaternion().setFromAxisAngle(axis, ease * Math.PI * 7)
    )
    if (t >= 1) triggerSettle()

  } else if (isSettling) {
    const t = Math.min((now - settleStartTime) / settleDuration, 1)
    const ease = t === 1 ? 1 : 1 - Math.pow(2,-10*t) * Math.cos((t*10-0.75)*(2*Math.PI/4.5))
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
        ;(mats as THREE.Material[]).forEach((m: any) => { m.map?.dispose(); m.dispose() })
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
  filter: brightness(1.1) drop-shadow(0 0 22px rgba(255,100,50,0.55));
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
