'use client'

import React, { useRef, useEffect, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// --- INTERFACCE PER LA PERSONALIZZAZIONE ---

/** Opzioni per un materiale THREE.js */
type MaterialOptions = THREE.MeshStandardMaterialParameters

/** Descrive la geometria e il materiale di una parte del cartello */
interface SignPart {
  geometry: THREE.BufferGeometry
  material?: MaterialOptions
  visible?: boolean
  position?: [number, number, number]
  rotation?: [number, number, number]
}

/** Proprietà per il contenuto web da visualizzare sul pannello */
export interface WebContent {
  html: string
  width?: number
  height?: number
  backgroundColor?: string
}

/** Props principali del componente Sign */
interface SignProps {
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
  webContent?: WebContent
  
  // Oggetti per personalizzare ogni parte del cartello
  panel?: Partial<SignPart>
  frame?: Partial<SignPart>
  stick?: Partial<SignPart>
  base?: Partial<SignPart>

  // Interazioni
  onInteract?: () => void
  onCameraMove?: (target: THREE.Vector3) => void
  hoverEffect?: {
    scale?: number
    glowColor?: THREE.ColorRepresentation
  }
}

// --- HOOK PER LA TEXTURE WEB (Migliorato) ---

function useWebTexture(content?: WebContent): THREE.CanvasTexture | null {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null)

  useEffect(() => {
    if (!content || !content.html) {
      texture?.dispose()
      setTexture(null)
      return
    }

    const { html, width = 1024, height = 576, backgroundColor = 'white' } = content
    
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    
    const canvasTexture = new THREE.CanvasTexture(canvas)
    canvasTexture.minFilter = THREE.LinearFilter
    canvasTexture.magFilter = THREE.LinearFilter
    canvasTexture.format = THREE.RGBAFormat

    const image = new Image()

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width: 100%; height: 100%; background-color: ${backgroundColor};">
            ${html}
          </div>
        </foreignObject>
      </svg>
    `
    // Usare btoa per evitare problemi con caratteri speciali nell'URL
    const url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)))

    image.onload = () => {
      if (context) {
        context.clearRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)
        canvasTexture.needsUpdate = true
      }
    }
    image.onerror = (err) => {
      console.error("Errore nel caricamento dell'immagine SVG per la texture:", err)
    }
    image.src = url

    setTexture(canvasTexture)

    return () => {
      canvasTexture.dispose()
      image.onload = null // Pulisci i listener
      image.onerror = null
    }
  }, [content])

  return texture
}

// --- COMPONENTE PRINCIPALE ---

export function Sign({
  position,
  rotation = [0, 0, 0],
  scale = 1,
  webContent,
  panel,
  frame,
  stick,
  base,
  onInteract,
  onCameraMove,
  hoverEffect = { scale: 1.05, glowColor: 0xffffff },
}: SignProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const [isHovered, setIsHovered] = useState(false)

  const webTexture = useWebTexture(webContent)

  // --- COSTRUZIONE DEL CARTELLO DINAMICA ---

  const parts = useMemo(() => {
    const s = scale // Abbreviazione per la leggibilità

    // Geometrie di default, possono essere sovrascritte
    const defaultGeometries = {
      panel: new THREE.BoxGeometry(4 * s, 2.25 * s, 0.05 * s),
      frame: new THREE.BoxGeometry(4.2 * s, 2.45 * s, 0.1 * s),
      stick: new THREE.CylinderGeometry(0.1 * s, 0.1 * s, 2.5 * s, 12),
      base: new THREE.CylinderGeometry(0.4 * s, 0.3 * s, 0.4 * s, 12),
    }

    // Materiali di default, possono essere sovrascritti
    const defaultMaterials = {
      // FIX: La texture ora è una mappa emissiva per essere sempre luminosa.
      panel: { 
        emissiveMap: webTexture, // La texture emette luce
        emissive: 0xffffff,      // Colore della luce emessa (bianco per non alterare i colori)
        color: 0x000000,         // Colore base nero per non riflettere la luce della scena
        polygonOffset: true,     // Risolve lo z-fighting in modo robusto
        polygonOffsetFactor: -1,
      },
      frame: { color: 0x332211 },
      stick: { color: 0x5C3D2E },
      base: { color: 0x555555 },
    }
    
    // Posizioni di default
    const defaultPositions: Record<string, [number, number, number]> = {
        // FIX: Rimosse le modifiche manuali per lo z-fighting
        panel: [0, 1.375 * s, 0.025 * s+.01],
        frame: [0, 1.375 * s, 0],
        stick: [0, 0, -0.1],
        base: [0, -1.25 * s, 0],
    }

    // Helper per creare una parte del cartello
    const createPart = (name: 'panel' | 'frame' | 'stick' | 'base', customPart?: Partial<SignPart>): SignPart => ({
      geometry: customPart?.geometry || defaultGeometries[name],
      material: { ...defaultMaterials[name], ...customPart?.material },
      visible: customPart?.visible ?? true,
      position: customPart?.position || defaultPositions[name],
      rotation: customPart?.rotation || [0,0,0],
    })

    return {
      panel: createPart('panel', panel),
      frame: createPart('frame', frame),
      stick: createPart('stick', stick),
      base: createPart('base', base),
    }
  }, [scale, webTexture, panel, frame, stick, base])

  // Cleanup delle risorse
  useEffect(() => {
    return () => {
      Object.values(parts).forEach(part => part.geometry.dispose())
    }
  }, [parts])

  // Animazione di hover
  useFrame((state, delta) => {
    if (groupRef.current) {
      const targetScale = isHovered ? (hoverEffect.scale || 1) : 1
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 8)
    }
  })

  const handleClick = (event: any) => {
    event.stopPropagation()
    if (onCameraMove) {
      const targetPos = new THREE.Vector3().setFromMatrixPosition(groupRef.current.matrixWorld)
      targetPos.y += 1.375 * scale
      onCameraMove(targetPos)
    }
    if (onInteract) onInteract()
  }

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      scale={scale}
      onPointerEnter={(e) => { e.stopPropagation(); setIsHovered(true) }}
      onPointerLeave={(e) => { e.stopPropagation(); setIsHovered(false) }}
      onClick={handleClick}
    >
      {/* Renderizza ogni parte se è visibile */}
      {Object.values(parts).map((part, index) =>
        part.visible ? (
          <mesh
            key={index}
            geometry={part.geometry}
            position={part.position}
            rotation={part.rotation}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial {...part.material} />
          </mesh>
        ) : null
      )}

      {/* Effetto glow quando hover */}
      {isHovered && hoverEffect.glowColor && (
         <mesh position={parts.frame.position}>
            <boxGeometry args={[4.4 * scale, 2.65 * scale, 0.12 * scale]} />
            <meshBasicMaterial
                color={hoverEffect.glowColor}
                transparent
                opacity={0.3}
                side={THREE.BackSide}
            />
        </mesh>
      )}
    </group>
  )
}

export default Sign
