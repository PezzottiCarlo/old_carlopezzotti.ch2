'use client'

import { Suspense, useRef, useState, useEffect, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Sky } from '@react-three/drei'
import { VoxelWorld, VoxelWorldRef, Block } from './voxel-words'
import * as THREE from 'three'
import CameraController from './camera'

function BlockOutlineEffect({ block }: { block: Block | null }) {
  const [intensity, setIntensity] = useState(0.3)

  useFrame((state) => {
    if (block) {
      const newIntensity = (Math.sin(state.clock.elapsedTime * 3) + 1) * 0.4 + 0.2
      setIntensity(newIntensity)
      block.setOutline(0xcccccc, newIntensity)
    }
  })

  useEffect(() => {
    return () => {
      if (block) {
        block.removeOutline()
      }
    }
  }, [block])

  return null
}

export default function Scene() {
  const voxelWorldRef = useRef<VoxelWorldRef>(null)
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null)
  const [previousBlock, setPreviousBlock] = useState<Block | null>(null)
  const [cameraTarget, setCameraTarget] = useState<THREE.Vector3 | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [surfaceBlocks, setSurfaceBlocks] = useState<Block[]>([])
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0)
  const [isWorldLoaded, setIsWorldLoaded] = useState(false)
  const lastScrollTime = useRef(0)

  const handleRegenerate = () => {
    if (voxelWorldRef.current) {
      voxelWorldRef.current.regenerate()
      setSelectedBlock(null)
      setCameraTarget(null)
      setSurfaceBlocks([]) // Reset dei blocchi di superficie
      setCurrentBlockIndex(0)
      setIsWorldLoaded(false) // Reset dello stato di caricamento
      
      // Genera 8 blocchi di superficie casuali dopo la rigenerazione
      setTimeout(() => {
        if (voxelWorldRef.current) {
          const randomSurfaceBlocks = voxelWorldRef.current.getRandomSurfaceBlocks(8)
          for (const block of randomSurfaceBlocks) {
            //add 2 block on the top of each block
            const pos = block.getPosition()
            
          }

          setSurfaceBlocks(randomSurfaceBlocks)
          setCurrentBlockIndex(0)
          console.log('Generati', randomSurfaceBlocks.length, 'blocchi di superficie casuali')
        }
      }, 300) // Aumentato il delay
    }
  }

  const handleGetSeed = () => {
    if (voxelWorldRef.current) {
      const currentSeed = voxelWorldRef.current.getSeed()
      console.log('Seed attuale:', currentSeed)
    }
  }

  const handleBlockClick = (block: Block | null) => {
    if (previousBlock && previousBlock !== block) {
      previousBlock.removeOutline()
    }
    setPreviousBlock(block)
    setSelectedBlock(block)
    if (block && !isAnimating) {
      const pos = block.getPosition()
      setCameraTarget(new THREE.Vector3(pos.x, pos.y, pos.z))
      setIsAnimating(true)
      console.log('Blocco selezionato:', block.getType(), pos)
    }
  }

  const handleAnimationComplete = () => {
    setIsAnimating(false)
    setCameraTarget(null)
  }

  const handleRemoveBlock = () => {
    if (selectedBlock) {
      selectedBlock.remove()
      setSelectedBlock(null)
    }
  }

  const handleChangeBlock = (newType: string) => {
    if (selectedBlock) {
      selectedBlock.change(newType)
    }
  }

  const handleSetColor = (color: string) => {
    if (selectedBlock) {
      selectedBlock.setColor(color)
    }
  }



  const moveToBlock = useCallback((block: Block) => {
    if (!isAnimating) {
      const pos = block.getPosition()
      setCameraTarget(new THREE.Vector3(pos.x, pos.y, pos.z))
      setIsAnimating(true)
      setSelectedBlock(block)
      console.log('Spostamento verso blocco:', block.getType(), pos, 'Indice:', currentBlockIndex)
    }
  }, [isAnimating, currentBlockIndex])

  const handleScroll = useCallback((event: WheelEvent) => {
    event.preventDefault()
    
    const now = Date.now()
    if (now - lastScrollTime.current < 300) return // Throttling di 300ms
    lastScrollTime.current = now
    
    console.log(surfaceBlocks)
    if (surfaceBlocks.length === 0 || isAnimating) return

    // Determina la direzione dello scroll
    const deltaY = event.deltaY

    if (deltaY > 0) {
      // Scroll verso il basso - blocco successivo
      const nextIndex = (currentBlockIndex + 1) % surfaceBlocks.length
      setCurrentBlockIndex(nextIndex)
      moveToBlock(surfaceBlocks[nextIndex])
    } else {
      // Scroll verso l'alto - blocco precedente
      const prevIndex = currentBlockIndex === 0 ? surfaceBlocks.length - 1 : currentBlockIndex - 1
      setCurrentBlockIndex(prevIndex)
      moveToBlock(surfaceBlocks[prevIndex])
    }
  }, [surfaceBlocks, currentBlockIndex, isAnimating, moveToBlock])

  // Aggiungi listener per lo scroll al Canvas
  useEffect(() => {
    const canvasElement = document.querySelector('canvas')
    if (canvasElement) {
      canvasElement.addEventListener('wheel', handleScroll, { passive: false })
      return () => {
        canvasElement.removeEventListener('wheel', handleScroll)
      }
    }
  }, [surfaceBlocks, currentBlockIndex, isAnimating, handleScroll])

  return (
    <>
      {/* Controlli UI */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1 }}>
        <button
          onClick={handleRegenerate}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Rigenera Mondo
        </button>
        <button
          onClick={handleGetSeed}
          style={{
            padding: '10px 20px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Mostra Seed
        </button>
      </div>

      {/* Info blocco selezionato */}
      {selectedBlock && (
        <div style={{
          position: 'absolute',
          top: 55,
          left: 10,
          zIndex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '15px',
          borderRadius: '4px',
          fontFamily: 'monospace',
          minWidth: '250px'
        }}>
          <div style={{ marginBottom: '10px' }}>
            <strong>Blocco Selezionato</strong>
          </div>
          <div>Tipo: {selectedBlock.getType()}</div>
          <div>Posizione: ({selectedBlock.getPosition().x}, {selectedBlock.getPosition().y}, {selectedBlock.getPosition().z})</div>

          <div style={{ marginTop: '15px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            <button
              onClick={handleRemoveBlock}
              style={{
                padding: '5px 10px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Rimuovi
            </button>

            <select
              onChange={(e) => handleChangeBlock(e.target.value)}
              defaultValue={selectedBlock.getType()}
              style={{
                padding: '5px',
                borderRadius: '3px',
                fontSize: '12px'
              }}
            >
              <option value="">Cambia tipo...</option>
              <option value="grass">Erba</option>
              <option value="dirt">Terra</option>
              <option value="stone">Pietra</option>
              <option value="sand">Sabbia</option>
              <option value="snow">Neve</option>
              <option value="rock">Roccia</option>
              <option value="water">Acqua</option>
            </select>

            <input
              type="color"
              onChange={(e) => handleSetColor(e.target.value)}
              style={{
                width: '40px',
                height: '28px',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
              title="Cambia colore"
            />
          </div>
        </div>
      )}

      {/* Indicatore animazione camera */}
      {isAnimating && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'white',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          padding: '10px 20px',
          borderRadius: '20px',
          fontSize: '14px',
          pointerEvents: 'none'
        }}>
          Spostamento verso il blocco...
        </div>
      )}

      {/* Indicatore blocchi di superficie */}
      {surfaceBlocks.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          color: 'white',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          padding: '10px 15px',
          borderRadius: '10px',
          fontSize: '12px',
          pointerEvents: 'none'
        }}>
          Blocco {currentBlockIndex + 1} di {surfaceBlocks.length}
          <br />
          <small>Usa la rotella del mouse per navigare</small>
        </div>
      )}

      <Canvas
        camera={{ position: [50, 50, 60], fov: 75 }}
        shadows
        gl={{
          antialias: true
        }}
      >
        {/* Cielo */}
        <Sky
          sunPosition={[100, 50, 100]}
          turbidity={8}
          rayleigh={6}
          mieCoefficient={0.005}
          mieDirectionalG={0.8}
        />

        {/* Luce ambientale */}
        <ambientLight intensity={0.4} />

        {/* Luce direzionale con ombre */}
        <directionalLight
          position={[100, 100, 50]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={300}
          shadow-camera-left={-100}
          shadow-camera-right={100}
          shadow-camera-top={100}
          shadow-camera-bottom={-100}
          shadow-bias={-0.0001}
        />

        {/* Mondo voxel */}
        <Suspense fallback={null}>
          <VoxelWorld
            ref={voxelWorldRef}
            onLoadingProgress={(progress) => {
              console.log(`Caricamento: ${Math.round(progress)}%`)
              if (progress === 100 && !isWorldLoaded) {
                setIsWorldLoaded(true)
                // Usa setTimeout per assicurarsi che il mondo sia completamente generato
                setTimeout(() => {
                  if (voxelWorldRef.current) {
                    const randomSurfaceBlocks = voxelWorldRef.current.getRandomSurfaceBlocks(8)
                    console.log('Blocchi di superficie generati:', randomSurfaceBlocks.length, 'blocchi') 
                    setSurfaceBlocks(randomSurfaceBlocks)
                    setCurrentBlockIndex(0)
                  }
                }, 200)
              }
            }}
            onBlockClick={handleBlockClick}
          />
        </Suspense>
        <CameraController
          targetPosition={cameraTarget}
          onComplete={handleAnimationComplete} 
          voxelWorldRef={voxelWorldRef}  
        />
        <BlockOutlineEffect block={selectedBlock} />
      </Canvas>
    </>
  )
}