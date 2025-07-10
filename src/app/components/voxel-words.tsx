// components/VoxelWorld.tsx
'use client'

import * as THREE from 'three'
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { createNoise2D, NoiseFunction2D } from 'simplex-noise'
import { BufferGeometryUtils } from 'three/examples/jsm/Addons.js'
import { useThree, useFrame } from '@react-three/fiber'
import { Sign } from './sign'
import { VoxelWorldRef, VoxelWorldProps, BlockData, SignData, Block, VoxelWorldInstance } from '../types/types'

const WORLD_SIZE = 128
const MAX_HEIGHT = 40
const WATER_LEVEL = 12
const BEACH_HEIGHT = WATER_LEVEL + 3
const NOISE_SCALE = 30
const OCTAVES = 2
const LACUNARITY = 2.0
const PERSISTENCE = 0.5
const TERRAIN_OFFSET = -2

// Shader leggeri per migliorare l'aspetto visivo
const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  uniform vec3 baseColor;
  uniform vec3 lightDirection;
  uniform float ambientStrength;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec2 vUv;
  
  void main() {
    vec3 normal = normalize(vNormal);
    
    // Illuminazione direzionale semplice
    float NdotL = max(dot(normal, lightDirection), 0.0);
    float diffuse = NdotL * 0.8 + ambientStrength;
    
    // Variazione di colore basata sulla posizione per texturing procedurale
    float noise = sin(vPosition.x * 0.5) * sin(vPosition.z * 0.5) * 0.1 + 0.9;
    vec3 color = baseColor * noise;
    
    // Ombreggiatura per facce laterali
    if (abs(normal.y) < 0.9) {
      color *= 0.8;
    }
    
    // Applica illuminazione
    color *= diffuse;
    
    gl_FragColor = vec4(color, 1.0);
  }
`

// Shader per l'acqua con riflessi leggeri
const waterVertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  
  void main() {
    vUv = uv;
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const waterFragmentShader = `
  uniform float time;
  varying vec2 vUv;
  varying vec3 vPosition;
  
  void main() {
    // Onde semplici
    float wave = sin(vPosition.x * 0.1 + time) * sin(vPosition.z * 0.1 + time * 0.7) * 0.02;
    
    // Colore acqua con gradiente
    vec3 waterColor = mix(vec3(0.2, 0.4, 0.8), vec3(0.4, 0.6, 0.9), wave + 0.5);
    
    gl_FragColor = vec4(waterColor, 0.8);
  }
`

// Materiali con shader personalizzati leggeri
const createMaterials = () => {
    const lightDirection = new THREE.Vector3(0.5, 0.8, 0.3).normalize()
    
    return {
        grass: new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                baseColor: { value: new THREE.Color(0x6a994e) },
                lightDirection: { value: lightDirection },
                ambientStrength: { value: 0.3 }
            }
        }),
        dirt: new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                baseColor: { value: new THREE.Color(0x8B4513) },
                lightDirection: { value: lightDirection },
                ambientStrength: { value: 0.25 }
            }
        }),
        stone: new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                baseColor: { value: new THREE.Color(0x696969) },
                lightDirection: { value: lightDirection },
                ambientStrength: { value: 0.2 }
            }
        }),
        sand: new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                baseColor: { value: new THREE.Color(0xF4A460) },
                lightDirection: { value: lightDirection },
                ambientStrength: { value: 0.4 }
            }
        }),
        snow: new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                baseColor: { value: new THREE.Color(0xFFFAFA) },
                lightDirection: { value: lightDirection },
                ambientStrength: { value: 0.6 }
            }
        }),
        rock: new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                baseColor: { value: new THREE.Color(0x654321) },
                lightDirection: { value: lightDirection },
                ambientStrength: { value: 0.15 }
            }
        })
    }
}

// Rumore semplificato
function getFractalNoise(noise2D: NoiseFunction2D, x: number, z: number): number {
    let total = 0
    let frequency = 1
    let amplitude = 1
    let maxValue = 0

    for (let i = 0; i < OCTAVES; i++) {
        total += noise2D(x * frequency, z * frequency) * amplitude
        maxValue += amplitude
        amplitude *= PERSISTENCE
        frequency *= LACUNARITY
    }

    return total / maxValue
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
    if (y > surfaceHeight || y === surfaceHeight) return true

    return y > heightMap[x - 1][z] || y > heightMap[x + 1][z] ||
           y > heightMap[x][z - 1] || y > heightMap[x][z + 1]
}

const MemoizedSign = React.memo(({ signData, onSignCameraMove }: { 
  signData: SignData, 
  onSignCameraMove?: (target: THREE.Vector3) => void 
}) => (
    <Sign
        position={signData.position}
        rotation={signData.rotation}
        scale={signData.scale}
        content={signData.content}
        style={signData.style}
        onCameraMove={onSignCameraMove}
    />
), (prev, next) => prev.signData.id === next.signData.id && 
                  JSON.stringify(prev.signData) === JSON.stringify(next.signData))

export const VoxelWorld = React.forwardRef<VoxelWorldRef, VoxelWorldProps>(
    ({ onLoadingProgress, onBlockClick, onSignCameraMove }, ref) => {
        const groupRef = useRef<THREE.Group>(null!)
        const [worldData, setWorldData] = useState<Map<string, BlockData>>(new Map())
        const worldDataRef = useRef<Map<string, BlockData>>(new Map())
        const [meshes, setMeshes] = useState<{ mesh: THREE.Mesh; type: string }[]>([])
        const [waterMesh, setWaterMesh] = useState<THREE.Mesh | null>(null)
        const [isGenerating, setIsGenerating] = useState(false)
        const [seed, setSeed] = useState(1)
        const [needsFullRebuild, setNeedsFullRebuild] = useState(true)
        const [surfaceBlocksData, setSurfaceBlocksData] = useState<BlockData[]>([])
        const [signs, setSigns] = useState<SignData[]>([])
        const signsRef = useRef<SignData[]>([])

        useEffect(() => {
            worldDataRef.current = worldData
            signsRef.current = signs
        }, [worldData, signs])

        const materials = useMemo(() => createMaterials(), [])
        const { gl, camera } = useThree()
        const raycaster = useMemo(() => new THREE.Raycaster(), [])
        const mouse = useMemo(() => new THREE.Vector2(), [])

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
                if (type === 'water') return
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
                if (newType === 'water') return
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
            setBlockOutline: () => {},
            removeBlockOutline: () => {}
        }), []) // IMPORTANTE: Dependenze vuote per evitare ricreazioni

        const getBlockAtMouse = useCallback((clientX: number, clientY: number) => {
            if (!groupRef.current) return null

            const rect = gl.domElement.getBoundingClientRect()
            mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1
            mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1

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
                const blockData = worldDataRef.current.get(blockKey)

                if (blockData && blockData.type !== 'water') {
                    return {
                        key: blockKey,
                        block: new Block(
                            blockData.position,
                            blockData.type,
                            new THREE.Vector3(blockX, blockY, blockZ),
                            worldInstance
                        )
                    }
                }
            }
            return null
        }, [gl, camera, raycaster, mouse, worldInstance])

        // Ricostruzione mesh semplificata
        useEffect(() => {
            if (!needsFullRebuild) return

            meshes.forEach(({ mesh }) => mesh.geometry.dispose())
            if (waterMesh) {
                waterMesh.geometry.dispose()
                ;(waterMesh.material as THREE.Material).dispose()
            }

            const blocksByType: { [key: string]: THREE.Vector3[] } = {}
            const waterPositions: THREE.Vector3[] = []

            worldData.forEach((block) => {
                const pos = new THREE.Vector3(block.position.x, block.position.y, block.position.z)
                if (block.type === 'water') {
                    waterPositions.push(pos)
                } else {
                    if (!blocksByType[block.type]) blocksByType[block.type] = []
                    blocksByType[block.type].push(pos)
                }
            })

            const newMeshes: { mesh: THREE.Mesh; type: string }[] = []

            Object.entries(blocksByType).forEach(([type, positions]) => {
                if (positions.length === 0) return

                const geometries = positions.map(pos => {
                    const geometry = new THREE.BoxGeometry(1, 1, 1)
                    geometry.translate(pos.x, pos.y, pos.z)
                    return geometry
                })

                const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries, false)
                geometries.forEach(g => g.dispose())

                const mesh = new THREE.Mesh(mergedGeometry, materials[type as keyof typeof materials])
                mesh.castShadow = true
                mesh.receiveShadow = true
                newMeshes.push({ mesh, type })
            })

            // Acqua con shader animato
            if (waterPositions.length > 0) {
                const waterGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 32, 32)
                waterGeometry.rotateX(-Math.PI / 2)
                waterGeometry.translate(0, WATER_LEVEL + 0.3, 0)
                
                const waterMaterial = new THREE.ShaderMaterial({
                    vertexShader: waterVertexShader,
                    fragmentShader: waterFragmentShader,
                    transparent: true,
                    uniforms: {
                        time: { value: 0 }
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

                for (let x = 0; x < WORLD_SIZE; x++) {
                    for (let z = 0; z < WORLD_SIZE; z++) {
                        const worldX = x - WORLD_SIZE / 2
                        const worldZ = z - WORLD_SIZE / 2
                        const surfaceHeight = heightMap[x][z]

                        for (let y = 0; y < Math.max(surfaceHeight + 1, WATER_LEVEL + 1); y++) {
                            if (y > MAX_HEIGHT || (y > surfaceHeight && y > WATER_LEVEL)) continue
                            if (!isBlockVisible(x, y, z, heightMap)) continue

                            const blockType = getBlockType(y, surfaceHeight)
                            const key = `${worldX},${y},${worldZ}`
                            const blockData: BlockData = { position: { x: worldX, y, z: worldZ }, type: blockType }

                            newWorldData.set(key, blockData)

                            if (y === surfaceHeight && blockType !== 'water' && surfaceHeight >= WATER_LEVEL) {
                                newSurfaceBlocks.push(blockData)
                            }
                        }
                    }
                }

                setWorldData(newWorldData)
                setSurfaceBlocksData(newSurfaceBlocks)
                setNeedsFullRebuild(true)
                setIsGenerating(false)
                onLoadingProgress?.(100)
            })
        }, [onLoadingProgress])

        // Event handlers semplificati
        const handleClick = useCallback((event: any) => {
            if (!onBlockClick) return
            const result = getBlockAtMouse(event.clientX, event.clientY)
            onBlockClick(result?.block || null)
        }, [getBlockAtMouse, onBlockClick])

        useEffect(() => {
            const canvas = gl.domElement
            canvas.addEventListener('click', handleClick)
            return () => canvas.removeEventListener('click', handleClick)
        }, [gl, handleClick])

        React.useImperativeHandle(ref, () => ({
            regenerate: generateWorld,
            isBlockVisible: (targetBlock: THREE.Vector3, camera: THREE.Camera): boolean => {
                // Semplificato
                return true
            },
            getSeed: () => seed,
            getBlock: (x: number, y: number, z: number) => {
                const key = `${x},${y},${z}`
                const blockData = worldDataRef.current.get(key)
                if (blockData && blockData.type !== 'water') {
                    return new Block(blockData.position, blockData.type, new THREE.Vector3(x, y, z), worldInstance)
                }
                return null
            },
            getRandomBlock: () => {
                const validBlocks = surfaceBlocksData.filter(block => 
                    block.type !== 'water' && block.position.y >= WATER_LEVEL
                )
                if (validBlocks.length === 0) return null
                
                const randomIndex = Math.floor(Math.random() * validBlocks.length)
                const blockData = validBlocks[randomIndex]
                return new Block(blockData.position, blockData.type, 
                    new THREE.Vector3(blockData.position.x, blockData.position.y, blockData.position.z), worldInstance)
            },
            getRandomSurfaceBlocks: (count: number) => {
                const validBlocks = surfaceBlocksData.filter(block => 
                    block.type !== 'water' && block.position.y >= WATER_LEVEL
                )
                const shuffled = [...validBlocks].sort(() => Math.random() - 0.5).slice(0, count)
                return shuffled.map(blockData => new Block(blockData.position, blockData.type,
                    new THREE.Vector3(blockData.position.x, blockData.position.y, blockData.position.z), worldInstance))
            },
            addSign: (signData: SignData) => {
                setSigns(prev => [...prev.filter(s => s.id !== signData.id), signData])
            },
            removeSign: (signId: string) => {
                setSigns(prev => prev.filter(s => s.id !== signId))
            },
            getSigns: () => signsRef.current
        }), [generateWorld, seed, surfaceBlocksData, worldInstance])

        useEffect(() => {
            generateWorld()
            return () => {
                meshes.forEach(({ mesh }) => {
                    mesh.geometry.dispose()
                    if (mesh.material instanceof THREE.Material) mesh.material.dispose()
                })
                if (waterMesh) {
                    waterMesh.geometry.dispose()
                    if (waterMesh.material instanceof THREE.Material) waterMesh.material.dispose()
                }
            }
        }, [])

        return (
            <group ref={groupRef} userData={{ isVoxelWorld: true }}>
                {meshes.map(({ mesh }, index) => (
                    <primitive key={`${seed}-${index}`} object={mesh} />
                ))}
                {waterMesh && <primitive object={waterMesh} />}
                {signs.map((sign) => (
                    <MemoizedSign
                        key={sign.id}
                        signData={sign}
                        onSignCameraMove={onSignCameraMove}
                    />
                ))}
            </group>
        )
    }
)

VoxelWorld.displayName = 'VoxelWorld'