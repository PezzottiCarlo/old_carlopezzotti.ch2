'use client'

import { Suspense, useRef, useState, useEffect, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Sky } from '@react-three/drei'
import { VoxelWorld, VoxelWorldRef, Block } from './voxel-words'
import * as THREE from 'three'
import CameraController from './camera'
import { Welcome } from './welcome'

// Componente per l'orbita automatica della camera durante il welcome
function AutoOrbitCamera({ isActive, onTransitionStart }: { isActive: boolean, onTransitionStart?: (position: THREE.Vector3, target: THREE.Vector3) => void }) {
  const { camera } = useThree()
  const orbitRef = useRef({ angle: 0, radius: 150, height: 80 })
  const transitionStartedRef = useRef(false)

  useFrame((state, delta) => {
    if (isActive) {
      // Incrementa l'angolo per l'orbita
      orbitRef.current.angle += delta * 0.1 // Velocità di rotazione

      // Calcola la nuova posizione della camera
      const x = Math.cos(orbitRef.current.angle) * orbitRef.current.radius
      const z = Math.sin(orbitRef.current.angle) * orbitRef.current.radius
      const y = orbitRef.current.height

      // Imposta la posizione della camera
      camera.position.set(x, y, z)

      // Fai guardare la camera verso il centro (0,0,0)
      camera.lookAt(0, 0, 0)

      // Reset del flag quando è attiva
      transitionStartedRef.current = false
    } else if (!transitionStartedRef.current && onTransitionStart) {
      // Quando si disattiva, passa la posizione corrente per la transizione
      transitionStartedRef.current = true
      const currentPosition = camera.position.clone()
      const currentTarget = new THREE.Vector3(0, 0, 0) // Il centro verso cui stava guardando
      onTransitionStart(currentPosition, currentTarget)
    }
  })

  return null
}

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
  const [isWorldLoaded, setIsWorldLoaded] = useState(false)
  const [hasStartedJourney, setHasStartedJourney] = useState(false)
  const [cameraTransitionData, setCameraTransitionData] = useState<{
    startPosition: THREE.Vector3
    startTarget: THREE.Vector3
  } | null>(null)

  const handleRegenerate = () => {
    if (voxelWorldRef.current) {
      voxelWorldRef.current.regenerate()
      setSelectedBlock(null)
      setCameraTarget(null)
      setIsWorldLoaded(false)
      setHasStartedJourney(false) // Reset dello stato del viaggio
      setCameraTransitionData(null) // Reset dei dati di transizione
    }
  }

  const handleGetSeed = () => {
    if (voxelWorldRef.current) {
      const currentSeed = voxelWorldRef.current.getSeed()
      console.log('Seed attuale:', currentSeed)
    }
  }

  const handleAddSign = () => {
    if (voxelWorldRef.current) {

      const blocc = (voxelWorldRef.current.getRandomSurfaceBlocks(1)[0])

      const signData = {
        id: `sign-${Date.now()}`,
        position: [blocc.getPosition().x, blocc.getPosition().y + 1, blocc.getPosition().z] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        webContent: {
          html: `
      <style>
        @keyframes pulse {
          0% { background-color: #3498db; transform: scale(1); }
          50% { background-color: #e74c3c; transform: scale(1.1); }
          100% { background-color: #3498db; transform: scale(1); }
        }
        .container {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
          height: 100%;
          background-color: #2c3e50;
        }
        .animated-box {
          width: 200px;
          height: 200px;
          animation: pulse 3s infinite;
        }
      </style>
      <div class="container">
        <div class="animated-box"></div>
      </div>
    `,
          backgroundColor: '#222',
        },
        // Nascondiamo la cornice e la base
        frame: { visible: false },
        base: { visible: false },
        // Cambiamo il palo in un cilindro sottile e metallico
        stick: {
          geometry: new THREE.CylinderGeometry(0.02, 0.02, 3, 16),
          material: { color: '#cccccc', metalness: 0.8, roughness: 0.2 },
        },
        // Il pannello è leggermente più sottile
        panel: {
          geometry: new THREE.BoxGeometry(4, 2.25, 0.02),
          position: [0, 1.5, 0],
          material: {
            emissive: '#ffffff', // Il materiale emette luce bianca
            emissiveIntensity: 0.7, // Intensità della luce per non "bruciare" l'immagine
          }
        },
        hoverEffect: {
          scale: 1.1,
          glowColor: '#00ffff',
        }
      }

      voxelWorldRef.current.addSign(signData)
      console.log('Cartello aggiunto!', signData)
    }
  }

  const handleBlockClick = (block: Block | null) => {
    // Solo se il viaggio è iniziato
    if (!hasStartedJourney) return

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

  // Gestione dello scroll
  useEffect(() => {
    const handleScroll = (e: WheelEvent) => {
      if (!hasStartedJourney) {
        // Durante il welcome, lo scroll attiva l'inizio del viaggio
        if (e.deltaY > 0) {
          setHasStartedJourney(true)
        }
        e.preventDefault()
      }
      // Dopo aver iniziato, lo scroll funziona normalmente per lo zoom
    }

    window.addEventListener('wheel', handleScroll, { passive: false })
    return () => window.removeEventListener('wheel', handleScroll)
  }, [hasStartedJourney])

  // Funzione per gestire l'inizio della transizione smooth
  const handleTransitionStart = useCallback((position: THREE.Vector3, target: THREE.Vector3) => {
    setCameraTransitionData({
      startPosition: position.clone(),
      startTarget: target.clone()
    })
  }, [])

  return (
    <>
      {/* Schermata di benvenuto */}
      <Welcome
        hasStartedJourney={hasStartedJourney}
        isWorldLoaded={isWorldLoaded}
        setHasStartedJourney={setHasStartedJourney}
      />

      {/* Controlli UI - visibili solo dopo aver iniziato */}
      {hasStartedJourney && (
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
              marginRight: '10px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Mostra Seed
          </button>
          <button
            onClick={handleAddSign}
            style={{
              padding: '10px 20px',
              backgroundColor: '#FF9800',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Aggiungi Cartello
          </button>
        </div>
      )}

      {/* Info blocco selezionato */}
      {selectedBlock && hasStartedJourney && (
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
      {isAnimating && hasStartedJourney && (
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

      <Canvas
        camera={{ position: [150, 80, 150], fov: 75 }}
        shadows
        gl={{
          antialias: true
        }}
      >
        {/* Camera orbita automatica durante il welcome */}
        <AutoOrbitCamera
          isActive={!hasStartedJourney}
          onTransitionStart={handleTransitionStart}
        />

        {/* Cielo */}


        {/* Luce ambientale */}
        <ambientLight intensity={0.4} />

        {/* Luce direzionale con ombre */}


        {/* Mondo voxel */}
        <Suspense fallback={null}>
          <VoxelWorld
            ref={voxelWorldRef}
            onLoadingProgress={(progress) => {
              console.log(`Caricamento: ${Math.round(progress)}%`)
              if (progress === 100 && !isWorldLoaded) {
                setIsWorldLoaded(true)
              }
            }}
            onBlockClick={handleBlockClick}
            onSignCameraMove={(target) => {
              // Solo se il viaggio è iniziato
              if (hasStartedJourney && !isAnimating) {
                setCameraTarget(target)
                setIsAnimating(true)
                console.log('Camera si muove verso il cartello:', target)
              }
            }}
          />
        </Suspense>

        {/* Controller camera normale - attivo solo dopo aver iniziato */}
        {hasStartedJourney && (
          <CameraController
            lookAtTarget={cameraTarget}
            onComplete={handleAnimationComplete}
            voxelWorldRef={voxelWorldRef}
            transitionData={cameraTransitionData}
          />
        )}

        {/* Effetto outline del blocco */}
        <BlockOutlineEffect block={selectedBlock} />
      </Canvas>
    </>
  )
}