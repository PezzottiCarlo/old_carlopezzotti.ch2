// components/VoxelWorld.tsx
'use client'

import * as THREE from 'three'
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { createNoise2D, NoiseFunction2D } from 'simplex-noise'
import { BufferGeometryUtils } from 'three/examples/jsm/Addons.js'
import { useThree, useFrame } from '@react-three/fiber'
import { Sign, WebContent } from './sign'

const WORLD_SIZE = 128
const MAX_HEIGHT = 40
const WATER_LEVEL = 12
const BEACH_HEIGHT = WATER_LEVEL + 3
const NOISE_SCALE = 30
const OCTAVES = 5
const LACUNARITY = 2.0
const PERSISTENCE = 0.5
const TERRAIN_OFFSET = -2

// Shader per l'acqua
const waterVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  
  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const waterFragmentShader = `
  uniform vec3 waterColor;
  uniform vec3 deepWaterColor;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  
  void main() {
    // Crea un gradiente basato sulla profondità
    float depth = smoothstep(0.0, 10.0, vWorldPosition.y);
    vec3 color = mix(deepWaterColor, waterColor, depth);
    
    // Aggiungi variazione nel colore basata sulla posizione
    float noise = sin(vWorldPosition.x * 0.05) * 
                  cos(vWorldPosition.z * 0.05) * 0.05 + 0.95;
    color *= noise;
    
    // Trasparenza fissa
    float alpha = 0.85;
    
    gl_FragColor = vec4(color, alpha);
  }
`

// Shader per i blocchi con illuminazione migliorata
const blockVertexShader = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`

const blockFragmentShader = `
  uniform vec3 baseColor;
  uniform vec3 sunDirection;
  uniform float ambientStrength;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  
  void main() {
    // Illuminazione di base
    vec3 normal = normalize(vNormal);
    float dotNL = dot(normal, sunDirection);
    float lighting = max(dotNL, 0.0) + ambientStrength;
    
    // Aggiungi un po' di variazione nel colore basata sulla posizione
    vec3 color = baseColor;
    float variation = sin(vWorldPosition.x * 0.1) * sin(vWorldPosition.z * 0.1) * 0.05 + 0.95;
    color *= variation;
    
    // Aggiungi ombreggiatura per i lati
    if (abs(normal.y) < 0.5) {
      color *= 0.85;
    }
    
    // Applica l'illuminazione
    vec3 finalColor = color * lighting;
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`

// Cache dei materiali con shaders
const createMaterials = () => {
  const sunDirection = new THREE.Vector3(0.5, 0.8, 0.3).normalize()
  
  return {
    grass: new THREE.ShaderMaterial({
      vertexShader: blockVertexShader,
      fragmentShader: blockFragmentShader,
      uniforms: {
        baseColor: { value: new THREE.Color(0x6a994e) },
        sunDirection: { value: sunDirection },
        ambientStrength: { value: 0.4 }
      }
    }),
    dirt: new THREE.ShaderMaterial({
      vertexShader: blockVertexShader,
      fragmentShader: blockFragmentShader,
      uniforms: {
        baseColor: { value: new THREE.Color(0x78552B) },
        sunDirection: { value: sunDirection },
        ambientStrength: { value: 0.4 }
      }
    }),
    stone: new THREE.ShaderMaterial({
      vertexShader: blockVertexShader,
      fragmentShader: blockFragmentShader,
      uniforms: {
        baseColor: { value: new THREE.Color(0x666666) },
        sunDirection: { value: sunDirection },
        ambientStrength: { value: 0.35 }
      }
    }),
    sand: new THREE.ShaderMaterial({
      vertexShader: blockVertexShader,
      fragmentShader: blockFragmentShader,
      uniforms: {
        baseColor: { value: new THREE.Color(0xc2b280) },
        sunDirection: { value: sunDirection },
        ambientStrength: { value: 0.45 }
      }
    }),
    snow: new THREE.ShaderMaterial({
      vertexShader: blockVertexShader,
      fragmentShader: blockFragmentShader,
      uniforms: {
        baseColor: { value: new THREE.Color(0xffffff) },
        sunDirection: { value: sunDirection },
        ambientStrength: { value: 0.5 }
      }
    }),
    rock: new THREE.ShaderMaterial({
      vertexShader: blockVertexShader,
      fragmentShader: blockFragmentShader,
      uniforms: {
        baseColor: { value: new THREE.Color(0x78552B) },
        sunDirection: { value: sunDirection },
        ambientStrength: { value: 0.3 }
      }
    })
  }
}

// Tipo per la callback di caricamento
type LoadingCallback = (progress: number) => void

// Tipo per cartello
export interface SignData {
    id: string
    position: [number, number, number]
    rotation?: [number, number, number]
    scale?: number
    webContent?: WebContent
}

// Tipo per info blocco
export interface BlockInfo {
    position: { x: number; y: number; z: number }
    type: string
    worldPosition: THREE.Vector3
}

// Classe Block con metodi
export class Block {
    private position: { x: number; y: number; z: number }
    private type: string
    private worldPosition: THREE.Vector3
    private worldRef: VoxelWorldInstance | null

    constructor(
        position: { x: number; y: number; z: number },
        type: string,
        worldPosition: THREE.Vector3,
        worldRef: VoxelWorldInstance | null
    ) {
        this.position = position
        this.type = type
        this.worldPosition = worldPosition
        this.worldRef = worldRef
    }

    getPosition() {
        return { ...this.position }
    }

    getType() {
        return this.type
    }

    getWorldPosition() {
        return this.worldPosition.clone()
    }

    remove() {
        if (this.worldRef) {
            this.worldRef.removeBlock(this.position)
        }
    }

    change(newType: string) {
        if (this.worldRef && newType !== 'water') {
            this.worldRef.changeBlock(this.position, newType)
            this.type = newType
        }
    }

    setColor(color: string | number) {
        if (this.worldRef) {
            this.worldRef.setBlockColor(this.position, color)
        }
    }

    setOutline(color: string | number, emissiveIntensity: number) {
        if (this.worldRef) {
            this.worldRef.setBlockOutline(this.position, color, emissiveIntensity)
        }
    }

    removeOutline() {
        if (this.worldRef) {
            this.worldRef.removeBlockOutline(this.position)
        }
    }
}

// Tipo per callback click
type BlockClickCallback = (block: Block | null) => void
type SignCameraMoveCallback = (target: THREE.Vector3) => void

interface VoxelWorldProps {
    onLoadingProgress?: LoadingCallback
    onBlockClick?: BlockClickCallback
    onSignCameraMove?: SignCameraMoveCallback
}

export interface VoxelWorldRef {
    regenerate: () => void
    getSeed: () => number
    getRandomSurfaceBlocks: (count: number) => Block[]
    getRandomBlock: () => Block | null
    getBlock: (x: number, y: number, z: number) => Block | null
    isBlockVisible:(target: THREE.Vector3,camera: THREE.Camera) => boolean
    addSign: (signData: SignData) => void
    removeSign: (signId: string) => void
    getSigns: () => SignData[]
}

// Interface per i metodi interni
interface VoxelWorldInstance {
    removeBlock: (position: { x: number; y: number; z: number }) => void
    changeBlock: (position: { x: number; y: number; z: number }, newType: string) => void
    addBlock: (position: { x: number; y: number; z: number }, type: string) => void
    setBlockColor: (position: { x: number; y: number; z: number }, color: string | number) => void
    setBlockOutline: (position: { x: number; y: number; z: number }, color: string | number, emissiveIntensity: number) => void
    removeBlockOutline: (position: { x: number; y: number; z: number }) => void
}

// Struttura per memorizzare info sui blocchi
interface BlockData {
    position: { x: number; y: number; z: number }
    type: string
    color?: string | number
    outline?: {
        color: string | number
        emissiveIntensity: number
    }
}

// Funzione per smooth noise con interpolazione
function smoothNoise(noise2D: NoiseFunction2D, x: number, z: number): number {
    const intX = Math.floor(x)
    const intZ = Math.floor(z)
    const fracX = x - intX
    const fracZ = z - intZ

    const a = noise2D(intX, intZ)
    const b = noise2D(intX + 1, intZ)
    const c = noise2D(intX, intZ + 1)
    const d = noise2D(intX + 1, intZ + 1)

    const fx = fracX * fracX * (3.0 - 2.0 * fracX)
    const fz = fracZ * fracZ * (3.0 - 2.0 * fracZ)

    const x1 = a * (1 - fx) + b * fx
    const x2 = c * (1 - fx) + d * fx

    return x1 * (1 - fz) + x2 * fz
}

function getFractalNoise(noise2D: NoiseFunction2D, x: number, z: number): number {
    let total = 0
    let frequency = 1
    let amplitude = 1
    let maxValue = 0

    for (let i = 0; i < OCTAVES; i++) {
        total += smoothNoise(noise2D, x * frequency, z * frequency) * amplitude
        maxValue += amplitude
        amplitude *= PERSISTENCE
        frequency *= LACUNARITY
    }

    const normalized = total / maxValue
    return Math.tanh(normalized * 1.5) / Math.tanh(1.5)
}

function getBlockType(y: number, surfaceHeight: number): string {
    if (y > surfaceHeight) return 'water'
    if (y === surfaceHeight) {
        if (surfaceHeight > 28) return 'snow'
        if (surfaceHeight > 22) return 'rock'
        if (surfaceHeight <= BEACH_HEIGHT) return 'sand'
        return 'grass'
    }
    if (surfaceHeight - y < 5) return 'dirt'
    return 'stone'
}

function isBlockVisible(x: number, y: number, z: number, heightMap: number[][]): boolean {
    if (x === 0 || x === WORLD_SIZE - 1 || z === 0 || z === WORLD_SIZE - 1) return true
    if (y === 0 || y === MAX_HEIGHT - 1) return true

    const surfaceHeight = heightMap[x][z]

    if (y > surfaceHeight) return true
    if (y === surfaceHeight) return true

    if (y > heightMap[x - 1][z] || y > heightMap[x + 1][z] ||
        y > heightMap[x][z - 1] || y > heightMap[x][z + 1]) {
        return true
    }

    return false
}

// Componente Water semplificato senza animazione
function WaterMesh({ waterMesh }: { waterMesh: THREE.Mesh }) {
    return <primitive object={waterMesh} />
}

export const VoxelWorld = React.forwardRef<VoxelWorldRef, VoxelWorldProps>(
    ({ onLoadingProgress, onBlockClick, onSignCameraMove }, ref) => {
        const groupRef = useRef<THREE.Group>(null!)
        const [worldData, setWorldData] = useState<Map<string, BlockData>>(new Map())
        const [meshes, setMeshes] = useState<{ mesh: THREE.Mesh; type: string }[]>([])
        const [waterMesh, setWaterMesh] = useState<THREE.Mesh | null>(null)
        const [outlineMeshes, setOutlineMeshes] = useState<Map<string, THREE.Mesh>>(new Map())
        const [isGenerating, setIsGenerating] = useState(false)
        const [seed, setSeed] = useState(1)
        const [needsFullRebuild, setNeedsFullRebuild] = useState(true)
        const [surfaceBlocksData, setSurfaceBlocksData] = useState<BlockData[]>([])
        const [signs, setSigns] = useState<SignData[]>([])
        const materials = useMemo(() => createMaterials(), [])

        // Three.js context
        const { gl, camera } = useThree()

        // Raycaster per il picking
        const raycaster = useMemo(() => new THREE.Raycaster(), [])
        const mouse = useMemo(() => new THREE.Vector2(), [])

        // Metodi per modificare i blocchi
        const worldInstance: VoxelWorldInstance = useMemo(() => ({
            removeBlock: (position: { x: number; y: number; z: number }) => {
                const key = `${position.x},${position.y},${position.z}`
                setWorldData(prev => {
                    const newData = new Map(prev)
                    newData.delete(key)
                    return newData
                })
                setNeedsFullRebuild(true)
            },

            addBlock: (position: { x: number; y: number; z: number }, type: string) => {
                if (type === 'water') {
                    console.warn('Non puoi aggiungere blocchi d\'acqua manualmente')
                    return
                }

                const key = `${position.x},${position.y},${position.z}`
                setWorldData(prev => {
                    const newData = new Map(prev)
                    if (!newData.has(key)) {
                        newData.set(key, { position, type })
                    }
                    return newData
                })
                setNeedsFullRebuild(true)
            },

            changeBlock: (position: { x: number; y: number; z: number }, newType: string) => {
                if (newType === 'water') {
                    console.warn('Non puoi cambiare blocchi in acqua')
                    return
                }
                
                const key = `${position.x},${position.y},${position.z}`
                setWorldData(prev => {
                    const newData = new Map(prev)
                    const block = newData.get(key)
                    if (block && block.type !== 'water') {
                        newData.set(key, { ...block, type: newType })
                    }
                    return newData
                })
                setNeedsFullRebuild(true)
            },

            setBlockColor: (position: { x: number; y: number; z: number }, color: string | number) => {
                const key = `${position.x},${position.y},${position.z}`
                setWorldData(prev => {
                    const newData = new Map(prev)
                    const block = newData.get(key)
                    if (block) {
                        newData.set(key, { ...block, color })
                    }
                    return newData
                })
                setNeedsFullRebuild(true)
            },

            setBlockOutline: (position: { x: number; y: number; z: number }, color: string | number, emissiveIntensity: number) => {
                const key = `${position.x},${position.y},${position.z}`
                const block = worldData.get(key)
                if (!block) return

                setOutlineMeshes(prev => {
                    const newOutlines = new Map(prev)
                    const existingOutline = newOutlines.get(key)

                    if (existingOutline) {
                        const material = existingOutline.material as THREE.MeshBasicMaterial
                        material.color = new THREE.Color(color).multiplyScalar(emissiveIntensity)
                    } else {
                        const outlineGeometry = new THREE.BoxGeometry(1.08, 1.08, 1.08)
                        const outlineMaterial = new THREE.MeshBasicMaterial({
                            color: new THREE.Color(color).multiplyScalar(emissiveIntensity),
                            transparent: true,
                            opacity: 0.5,
                        })
                        const outlineMesh = new THREE.Mesh(outlineGeometry, outlineMaterial)
                        outlineMesh.position.set(block.position.x, block.position.y, block.position.z)
                        newOutlines.set(key, outlineMesh)
                    }

                    return newOutlines
                })
            },

            removeBlockOutline: (position: { x: number; y: number; z: number }) => {
                const key = `${position.x},${position.y},${position.z}`
                setOutlineMeshes(prev => {
                    const newOutlines = new Map(prev)
                    const outline = newOutlines.get(key)
                    if (outline) {
                        outline.geometry.dispose()
                        ;(outline.material as THREE.Material).dispose()
                        newOutlines.delete(key)
                    }
                    return newOutlines
                })
            }
        }), [worldData])

        // Ricostruisci le mesh quando i dati cambiano
        useEffect(() => {
            if (!needsFullRebuild) return

            // Pulisci le mesh esistenti
            meshes.forEach(({ mesh }) => {
                mesh.geometry.dispose()
            })

            if (waterMesh) {
                waterMesh.geometry.dispose()
                ;(waterMesh.material as THREE.Material).dispose()
            }

            const blocksByType: { [key: string]: { geometry: THREE.BoxGeometry; position: THREE.Vector3 }[] } = {}
            const waterPositions: THREE.Vector3[] = []

            worldData.forEach((block) => {
                if (block.type === 'water') {
                    waterPositions.push(new THREE.Vector3(block.position.x, block.position.y, block.position.z))
                } else {
                    if (!blocksByType[block.type]) {
                        blocksByType[block.type] = []
                    }

                    const geometry = new THREE.BoxGeometry(1, 1, 1)
                    const position = new THREE.Vector3(block.position.x, block.position.y, block.position.z)

                    blocksByType[block.type].push({ geometry, position })
                }
            })

            // Crea mesh per i blocchi normali
            const newMeshes: { mesh: THREE.Mesh; type: string }[] = []

            Object.entries(blocksByType).forEach(([type, blocks]) => {
                if (blocks.length === 0) return

                const geometries = blocks.map(b => {
                    b.geometry.translate(b.position.x, b.position.y, b.position.z)
                    return b.geometry
                })

                const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries, false)
                geometries.forEach(g => g.dispose())

                const mesh = new THREE.Mesh(mergedGeometry, materials[type as keyof typeof materials])
                mesh.castShadow = true
                mesh.receiveShadow = true
                newMeshes.push({ mesh, type })
            })

            // Crea mesh unificata per l'acqua
            if (waterPositions.length > 0) {
                // Trova i bounds dell'acqua
                let minX = Infinity, maxX = -Infinity
                let minZ = Infinity, maxZ = -Infinity
                
                waterPositions.forEach(pos => {
                    minX = Math.min(minX, pos.x)
                    maxX = Math.max(maxX, pos.x)
                    minZ = Math.min(minZ, pos.z)
                    maxZ = Math.max(maxZ, pos.z)
                })

                // Crea un piano grande per l'acqua
                const waterWidth = maxX - minX + 1
                const waterDepth = maxZ - minZ + 1
                const waterGeometry = new THREE.PlaneGeometry(waterWidth, waterDepth, waterWidth, waterDepth)
                waterGeometry.rotateX(-Math.PI / 2)
                // Posiziona l'acqua leggermente sotto il livello del blocco per dare spessore
                waterGeometry.translate((minX + maxX) / 2, WATER_LEVEL + 0.3, (minZ + maxZ) / 2)

                const waterMaterial = new THREE.ShaderMaterial({
                    vertexShader: waterVertexShader,
                    fragmentShader: waterFragmentShader,
                    transparent: true,
                    uniforms: {
                        waterColor: { value: new THREE.Color(0x4d90fe) },
                        deepWaterColor: { value: new THREE.Color(0x1a5490) }
                    }
                })

                const water = new THREE.Mesh(waterGeometry, waterMaterial)
                water.receiveShadow = true
                setWaterMesh(water)
            } else {
                setWaterMesh(null)
            }

            setMeshes(newMeshes)
            setNeedsFullRebuild(false)
        }, [worldData, needsFullRebuild, materials])

        const generateWorld = useCallback(() => {
            setIsGenerating(true)

            requestAnimationFrame(() => {
                const newSeed = Math.floor(Math.random() * 1000000)
                setSeed(newSeed)
                const noise2D = createNoise2D(() => (newSeed * 9301 + 49297) % 233280 / 233280)

                const heightMap: number[][] = Array(WORLD_SIZE).fill(null).map(() => Array(WORLD_SIZE).fill(0))

                for (let x = 0; x < WORLD_SIZE; x++) {
                    for (let z = 0; z < WORLD_SIZE; z++) {
                        const worldX = x - WORLD_SIZE / 2
                        const worldZ = z - WORLD_SIZE / 2
                        const noiseValue = getFractalNoise(noise2D, worldX / NOISE_SCALE, worldZ / NOISE_SCALE)
                        heightMap[x][z] = Math.floor(((noiseValue + 1) / 2) * MAX_HEIGHT) + TERRAIN_OFFSET
                    }

                    if (onLoadingProgress && x % 4 === 0) {
                        onLoadingProgress((x / WORLD_SIZE) * 50)
                    }
                }

                const newWorldData = new Map<string, BlockData>()
                const newSurfaceBlocks: BlockData[] = []
                let processedBlocks = 0
                const totalBlocks = WORLD_SIZE * WORLD_SIZE

                for (let x = 0; x < WORLD_SIZE; x++) {
                    for (let z = 0; z < WORLD_SIZE; z++) {
                        const worldX = x - WORLD_SIZE / 2
                        const worldZ = z - WORLD_SIZE / 2
                        const surfaceHeight = heightMap[x][z]
                        let surfaceBlockAdded = false

                        for (let y = 0; y < Math.max(surfaceHeight + 1, WATER_LEVEL + 1); y++) {
                            if (y > MAX_HEIGHT) continue
                            if (y > surfaceHeight && y > WATER_LEVEL) continue

                            if (!isBlockVisible(x, y, z, heightMap)) continue

                            const blockType = getBlockType(y, surfaceHeight)
                            const key = `${worldX},${y},${worldZ}`

                            const blockData: BlockData = {
                                position: { x: worldX, y, z: worldZ },
                                type: blockType
                            }

                            newWorldData.set(key, blockData)

                            // Aggiungi ai blocchi di superficie se è il blocco più alto di questa colonna e non è acqua
                            if (!surfaceBlockAdded && y === surfaceHeight && blockType !== 'water' && surfaceHeight >= WATER_LEVEL) {
                                newSurfaceBlocks.push(blockData)
                                surfaceBlockAdded = true
                            }
                        }

                        processedBlocks++
                        if (onLoadingProgress && processedBlocks % 64 === 0) {
                            onLoadingProgress(50 + (processedBlocks / totalBlocks) * 50)
                        }
                    }
                }

                setWorldData(newWorldData)
                setSurfaceBlocksData(newSurfaceBlocks)
                setNeedsFullRebuild(true)
                setIsGenerating(false)

                if (onLoadingProgress) {
                    onLoadingProgress(100)
                }
            })
        }, [onLoadingProgress])

        // Gestione click sui blocchi
        const handlePointerDown = useCallback((event: any) => {
            if (!onBlockClick || !groupRef.current) return

            const rect = gl.domElement.getBoundingClientRect()
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

            raycaster.setFromCamera(mouse, camera)
            const intersects = raycaster.intersectObject(groupRef.current, true)

            if (intersects.length > 0) {
                const hit = intersects[0]
                const point = hit.point
                const normal = hit.face?.normal || new THREE.Vector3(0, 1, 0)

                const blockPos = point.clone().sub(normal.clone().multiplyScalar(0.5))
                const blockX = Math.round(blockPos.x)
                const blockY = Math.round(blockPos.y)
                const blockZ = Math.round(blockPos.z)

                const blockKey = `${blockX},${blockY},${blockZ}`
                const blockData = worldData.get(blockKey)

                if (blockData && blockData.type !== 'water') {
                    const block = new Block(
                        blockData.position,
                        blockData.type,
                        new THREE.Vector3(blockX, blockY, blockZ),
                        worldInstance
                    )
                    onBlockClick(block)
                } else {
                    onBlockClick(null)
                }
            } else {
                onBlockClick(null)
            }
        }, [gl, camera, raycaster, mouse, worldData, onBlockClick, worldInstance])

        useEffect(() => {
            const canvas = gl.domElement
            canvas.addEventListener('pointerdown', handlePointerDown)

            return () => {
                canvas.removeEventListener('pointerdown', handlePointerDown)
            }
        }, [gl, handlePointerDown])

        React.useImperativeHandle(ref, () => ({
            regenerate: () => {
                generateWorld()
            },
            isBlockVisible: (targetBlock: THREE.Vector3, camera: THREE.Camera): boolean => {
                const direction = new THREE.Vector3().subVectors(targetBlock, camera.position).normalize()
                const distance = camera.position.distanceTo(targetBlock)
                const steps = Math.ceil(distance)
                
                for (let i = 1; i < steps; i++) {
                    const checkPoint = camera.position.clone().add(direction.clone().multiplyScalar(i))
                    const x = Math.round(checkPoint.x)
                    const y = Math.round(checkPoint.y)
                    const z = Math.round(checkPoint.z)
                    
                    const key = `${x},${y},${z}`
                    if (worldData.has(key)) {
                        if (x !== Math.round(targetBlock.x) || 
                            y !== Math.round(targetBlock.y) || 
                            z !== Math.round(targetBlock.z)) {
                            return false
                        }
                    }
                }
                
                return true
            },
            getSeed: () => seed,
            getBlock: (x: number, y: number, z: number) => {
                const key = `${x},${y},${z}`
                const blockData = worldData.get(key)
                if (blockData && blockData.type !== 'water') {
                    return new Block(
                        blockData.position,
                        blockData.type,
                        new THREE.Vector3(x, y, z),
                        worldInstance
                    )
                }
                return null
            },
            getRandomBlock: () => {
                const validBlocks = surfaceBlocksData.filter(block => 
                    block.type !== 'water' && block.position.y >= WATER_LEVEL
                )
                
                if (validBlocks.length === 0) {
                    console.warn('Nessun blocco di superficie valido trovato')
                    return null
                }
                
                const randomIndex = Math.floor(Math.random() * validBlocks.length)
                const blockData = validBlocks[randomIndex]
                
                return new Block(
                    blockData.position,
                    blockData.type,
                    new THREE.Vector3(blockData.position.x, blockData.position.y, blockData.position.z),
                    worldInstance
                )
            },
            getRandomSurfaceBlocks: (count: number) => {
                const surfaceBlocks: Block[] = []

                if (surfaceBlocksData.length === 0) {
                    console.warn('Nessun blocco di superficie disponibile')
                    return []
                }

                // Filtra solo i blocchi sopra l'acqua
                const validBlocks = surfaceBlocksData.filter(block => 
                    block.type !== 'water' && block.position.y >= WATER_LEVEL
                )

                // Seleziona casualmente count blocchi distanziati
                const shuffled = [...validBlocks].sort(() => Math.random() - 0.5)
                const selected: BlockData[] = []

                // Selezione con distanza minima per evitare blocchi troppo vicini
                for (const block of shuffled) {
                    if (selected.length >= count) break

                    const tooClose = selected.some(selectedBlock => {
                        const dx = block.position.x - selectedBlock.position.x
                        const dz = block.position.z - selectedBlock.position.z
                        const distance = Math.sqrt(dx * dx + dz * dz)
                        return distance < 8 // Distanza minima di 8 blocchi
                    })

                    if (!tooClose) {
                        selected.push(block)
                    }
                }

                // Se non abbiamo abbastanza blocchi distanziati, aggiungi altri casuali
                if (selected.length < count) {
                    const remaining = shuffled.filter(block => !selected.includes(block))
                    selected.push(...remaining.slice(0, count - selected.length))
                }

                selected.forEach(blockData => {
                    const block = new Block(
                        blockData.position,
                        blockData.type,
                        new THREE.Vector3(blockData.position.x, blockData.position.y, blockData.position.z),
                        worldInstance
                    )
                    surfaceBlocks.push(block)
                })

                return surfaceBlocks
            },
            addSign: (signData: SignData) => {
                setSigns(prev => {
                    // Rimuovi eventuale cartello esistente con lo stesso ID
                    const filtered = prev.filter(s => s.id !== signData.id)
                    return [...filtered, signData]
                })
            },
            removeSign: (signId: string) => {
                setSigns(prev => prev.filter(s => s.id !== signId))
            },
            getSigns: () => signs
        }), [generateWorld, seed, surfaceBlocksData, worldInstance, worldData, signs])

        useEffect(() => {
            generateWorld()

            return () => {
                meshes.forEach(({ mesh }) => {
                    mesh.geometry.dispose()
                    if (mesh.material instanceof THREE.Material) {
                        mesh.material.dispose()
                    }
                })
                if (waterMesh) {
                    waterMesh.geometry.dispose()
                    if (waterMesh.material instanceof THREE.Material) {
                        waterMesh.material.dispose()
                    }
                }
                outlineMeshes.forEach(mesh => {
                    mesh.geometry.dispose()
                    if (mesh.material instanceof THREE.Material) {
                        mesh.material.dispose()
                    }
                })
            }
        }, [])

        return (
            <group ref={groupRef} userData={{ isVoxelWorld: true }}>
                {meshes.map(({ mesh }, index) => (
                    <primitive
                        key={`${seed}-${index}`}
                        object={mesh}
                    />
                ))}
                {waterMesh && <WaterMesh waterMesh={waterMesh} />}
                {Array.from(outlineMeshes.entries()).map(([key, mesh]) => (
                    <primitive
                        key={`outline-${key}`}
                        object={mesh}
                    />
                ))}
                {/* Render dei cartelli */}
                {signs.map((sign) => (
                    <Sign
                        key={sign.id}
                        position={sign.position}
                        rotation={sign.rotation}
                        scale={sign.scale}
                        webContent={sign.webContent}
                        onInteract={() => {
                            console.log(`Interazione con cartello: ${sign.id}`)
                        }}
                        onCameraMove={onSignCameraMove}
                    />
                ))}
            </group>
        )
    }
)

VoxelWorld.displayName = 'VoxelWorld'