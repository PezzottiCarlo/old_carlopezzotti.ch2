// components/VoxelWorld.tsx
'use client'

import * as THREE from 'three'
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { createNoise2D, NoiseFunction2D } from 'simplex-noise'
import { BufferGeometryUtils } from 'three/examples/jsm/Addons.js'
import { useThree } from '@react-three/fiber'

const WORLD_SIZE = 128
const MAX_HEIGHT = 40
const WATER_LEVEL = 12
const BEACH_HEIGHT = WATER_LEVEL + 3
const NOISE_SCALE = 90
const OCTAVES = 5
const LACUNARITY = 2.0
const PERSISTENCE = 0.5
const TERRAIN_OFFSET = -2

// Cache dei materiali per evitare ricreazioni
const MATERIALS = {
    grass: new THREE.MeshLambertMaterial({ color: 0x6a994e }),
    dirt: new THREE.MeshLambertMaterial({ color: 0x78552B }),
    stone: new THREE.MeshLambertMaterial({ color: 0x666666 }),
    sand: new THREE.MeshLambertMaterial({ color: 0xc2b280 }),
    water: new THREE.MeshLambertMaterial({ color: 0x3d5a80, transparent: true, opacity: 0.8 }),
    snow: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    rock: new THREE.MeshLambertMaterial({ color: 0x444444 })
}

// Tipo per la callback di caricamento
type LoadingCallback = (progress: number) => void

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
        if (this.worldRef && MATERIALS[newType as keyof typeof MATERIALS]) {
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

interface VoxelWorldProps {
    onLoadingProgress?: LoadingCallback
    onBlockClick?: BlockClickCallback
}

export interface VoxelWorldRef {
    regenerate: () => void
    getSeed: () => number
    getRandomSurfaceBlocks: (count: number) => Block[]
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
    
    if (y > heightMap[x-1][z] || y > heightMap[x+1][z] ||
        y > heightMap[x][z-1] || y > heightMap[x][z+1]) {
        return true
    }
    
    return false
}

export const VoxelWorld = React.forwardRef<VoxelWorldRef, VoxelWorldProps>(
    ({ onLoadingProgress, onBlockClick }, ref) => {
        const groupRef = useRef<THREE.Group>(null!)
        const [worldData, setWorldData] = useState<Map<string, BlockData>>(new Map())
        const [meshes, setMeshes] = useState<{ mesh: THREE.Mesh; type: string }[]>([])
        const [outlineMeshes, setOutlineMeshes] = useState<Map<string, THREE.Mesh>>(new Map())
        const [isGenerating, setIsGenerating] = useState(false)
        const [seed, setSeed] = useState(1)
        const [needsFullRebuild, setNeedsFullRebuild] = useState(true)
        const [surfaceBlocksData, setSurfaceBlocksData] = useState<BlockData[]>([])
        
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
                if (!MATERIALS[type as keyof typeof MATERIALS]) {
                    console.warn(`Tipo di blocco "${type}" non supportato`)
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
                const key = `${position.x},${position.y},${position.z}`
                setWorldData(prev => {
                    const newData = new Map(prev)
                    const block = newData.get(key)
                    if (block) {
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
            
            meshes.forEach(({ mesh }) => {
                mesh.geometry.dispose()
            })
            
            const blocksByType: { [key: string]: { geometry: THREE.BoxGeometry; position: THREE.Vector3; color?: string | number }[] } = {}
            
            worldData.forEach((block, key) => {
                if (!blocksByType[block.type]) {
                    blocksByType[block.type] = []
                }
                
                const geometry = new THREE.BoxGeometry(1, 1, 1)
                const position = new THREE.Vector3(block.position.x, block.position.y, block.position.z)
                
                blocksByType[block.type].push({
                    geometry,
                    position,
                    color: block.color
                })
            })
            
            const newMeshes: { mesh: THREE.Mesh; type: string }[] = []
            
            Object.entries(blocksByType).forEach(([type, blocks]) => {
                if (blocks.length === 0) return
                
                const firstColor = blocks[0].color
                const allSameColor = blocks.every(b => b.color === firstColor)
                
                if (allSameColor && !firstColor) {
                    const geometries = blocks.map(b => {
                        b.geometry.translate(b.position.x, b.position.y, b.position.z)
                        return b.geometry
                    })
                    
                    const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries, false)
                    geometries.forEach(g => g.dispose())
                    
                    const mesh = new THREE.Mesh(mergedGeometry, MATERIALS[type as keyof typeof MATERIALS])
                    mesh.castShadow = true
                    mesh.receiveShadow = true
                    newMeshes.push({ mesh, type })
                } else {
                    blocks.forEach(block => {
                        const baseMaterial = block.color 
                            ? new THREE.MeshLambertMaterial({ color: block.color })
                            : MATERIALS[type as keyof typeof MATERIALS]
                        
                        const mesh = new THREE.Mesh(block.geometry, baseMaterial)
                        mesh.position.copy(block.position)
                        mesh.castShadow = true
                        mesh.receiveShadow = true
                        newMeshes.push({ mesh, type })
                    })
                }
            })
            
            setMeshes(newMeshes)
            setNeedsFullRebuild(false)
        }, [worldData, needsFullRebuild])

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
                            if (!surfaceBlockAdded && y === surfaceHeight && blockType !== 'water') {
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
                
                console.log('Generati', newSurfaceBlocks.length, 'blocchi di superficie durante la generazione')
                
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
                
                if (blockData) {
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
            getSeed: () => seed,
            getRandomSurfaceBlocks: (count: number) => {
                const surfaceBlocks: Block[] = []
                
                console.log('Blocchi di superficie già disponibili:', surfaceBlocksData.length)
                
                if (surfaceBlocksData.length === 0) {
                    console.warn('Nessun blocco di superficie disponibile')
                    return []
                }
                
                // Seleziona casualmente count blocchi distanziati
                const shuffled = [...surfaceBlocksData].sort(() => Math.random() - 0.5)
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
                
                console.log('Blocchi di superficie selezionati:', surfaceBlocks.length)
                return surfaceBlocks
            }
        }), [generateWorld, seed, surfaceBlocksData, worldInstance])

        useEffect(() => {
            generateWorld()
            
            return () => {
                meshes.forEach(({ mesh }) => {
                    mesh.geometry.dispose()
                    if (mesh.material instanceof THREE.Material) {
                        mesh.material.dispose()
                    }
                })
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
                {Array.from(outlineMeshes.entries()).map(([key, mesh]) => (
                    <primitive
                        key={`outline-${key}`}
                        object={mesh}
                    />
                ))}
            </group>
        )
    }
)

VoxelWorld.displayName = 'VoxelWorld'