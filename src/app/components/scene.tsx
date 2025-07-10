// scene.tsx
'use client'

import { Suspense, useRef, useState, useEffect, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import * as THREE from 'three'
import CameraController from './camera'
import { Welcome } from './welcome'
import { Block, VoxelWorldRef, SignData } from '../types/types'
import { VoxelWorld } from './voxel-words'

function AutoOrbitCamera({ isActive, onTransitionStart }: { isActive: boolean, onTransitionStart?: (position: THREE.Vector3, target: THREE.Vector3) => void }) {
  const { camera } = useThree()
  const orbitRef = useRef({ angle: 0, radius: 150, height: 80 })

  useFrame((state, delta) => {
    if (isActive) {
      orbitRef.current.angle += delta * 0.1
      const x = Math.cos(orbitRef.current.angle) * orbitRef.current.radius
      const z = Math.sin(orbitRef.current.angle) * orbitRef.current.radius
      camera.position.set(x, orbitRef.current.height, z)
      camera.lookAt(0, 0, 0)
    } else if (onTransitionStart) {
      onTransitionStart(camera.position.clone(), new THREE.Vector3(0, 0, 0))
    }
  })

  return null
}

function BlockOutlineEffect({ block }: { block: Block | null }) {
  useFrame((state) => {
    if (block) {
      const intensity = (Math.sin(state.clock.elapsedTime * 3) + 1) * 0.4 + 0.2
      block.setOutline(0xcccccc, intensity)
    }
  })

  useEffect(() => {
    return () => block?.removeOutline()
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

  // Handlers consolidati
  const handleRegenerate = useCallback(() => {
    if (!voxelWorldRef.current) return
    
    voxelWorldRef.current.regenerate()
    setSelectedBlock(null)
    setPreviousBlock(null)
    setCameraTarget(null)
    setIsWorldLoaded(false)
    setHasStartedJourney(false)
    setCameraTransitionData(null)
  }, [])

  const handleGetSeed = useCallback(() => {
    if (voxelWorldRef.current) {
      console.log('Seed attuale:', voxelWorldRef.current.getSeed())
    }
  }, [])

  const handleAddSign = useCallback(() => {
    if (!voxelWorldRef.current) return
    
    const blocks = voxelWorldRef.current.getRandomSurfaceBlocks(1)
    const block = blocks[0]
    if (!block) return

    const signData: SignData = {
      id: `sign-${Date.now()}`,
      position: [block.getPosition().x, block.getPosition().y + 1, block.getPosition().z],
      content: {
        title: 'TITOLO PROVA',
        body: ['Riga 1', 'Riga 2', 'Riga 3'],
        footer: 'Footer prova'
      }
    }
    
    voxelWorldRef.current.addSign(signData)
  }, [])

  const handleBlockClick = useCallback((block: Block | null) => {
    if (!hasStartedJourney || isAnimating) return

    // Pulisci outline precedente
    if (previousBlock && previousBlock !== block) {
      previousBlock.removeOutline()
    }

    setPreviousBlock(block)
    setSelectedBlock(block)

    if (block) {
      const pos = block.getPosition()
      setCameraTarget(new THREE.Vector3(pos.x, pos.y, pos.z))
      setIsAnimating(true)
    }
  }, [hasStartedJourney, isAnimating, previousBlock])

  const handleAnimationComplete = useCallback(() => {
    setIsAnimating(false)
    setCameraTarget(null)
  }, [])

  const handleBlockAction = useCallback((action: 'remove' | 'change' | 'color', value?: string) => {
    if (!selectedBlock) return

    switch (action) {
      case 'remove':
        selectedBlock.remove()
        setSelectedBlock(null)
        break
      case 'change':
        if (value) selectedBlock.change(value)
        break
      case 'color':
        if (value) selectedBlock.setColor(value)
        break
    }
  }, [selectedBlock])

  const handleLoadingProgress = useCallback((progress: number) => {
    if (progress === 100 && !isWorldLoaded) {
      setIsWorldLoaded(true)
    }
  }, [isWorldLoaded])

  const handleSignCameraMove = useCallback((target: THREE.Vector3) => {
    // I cartelli ora non muovono automaticamente la camera
    // L'utente può decidere di muoversi manualmente verso il cartello
    console.log('Cartello cliccato alla posizione:', target)
  }, [])

  const handleTransitionStart = useCallback((position: THREE.Vector3, target: THREE.Vector3) => {
    setCameraTransitionData({
      startPosition: position.clone(),
      startTarget: target.clone()
    })
  }, [])

  // Scroll per iniziare il viaggio
  useEffect(() => {
    const handleScroll = (e: WheelEvent) => {
      if (!hasStartedJourney && e.deltaY > 0) {
        setHasStartedJourney(true)
        e.preventDefault()
      }
    }
    
    window.addEventListener('wheel', handleScroll, { passive: false })
    return () => window.removeEventListener('wheel', handleScroll)
  }, [hasStartedJourney])

  return (
    <>
      <Welcome
        hasStartedJourney={hasStartedJourney}
        isWorldLoaded={isWorldLoaded}
        setHasStartedJourney={setHasStartedJourney}
      />

      {hasStartedJourney && (
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1, display: 'flex', gap: '10px' }}>
          <button onClick={handleRegenerate} style={{ padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Rigenera Mondo
          </button>
          <button onClick={handleGetSeed} style={{ padding: '10px 20px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Mostra Seed
          </button>
          <button onClick={handleAddSign} style={{ padding: '10px 20px', backgroundColor: '#FF9800', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Aggiungi Cartello
          </button>
        </div>
      )}

      {selectedBlock && hasStartedJourney && (
        <div style={{ position: 'absolute', top: 65, left: 10, zIndex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)', color: 'white', padding: '15px', borderRadius: '4px', fontFamily: 'monospace', minWidth: '250px' }}>
          <div style={{ marginBottom: '10px' }}><strong>Blocco Selezionato</strong></div>
          <div>Tipo: {selectedBlock.getType()}</div>
          <div>Posizione: ({selectedBlock.getPosition().x}, {selectedBlock.getPosition().y}, {selectedBlock.getPosition().z})</div>
          <div style={{ marginTop: '15px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            <button onClick={() => handleBlockAction('remove')} style={{ padding: '5px 10px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px' }}>
              Rimuovi
            </button>
            <select onChange={(e) => handleBlockAction('change', e.target.value)} defaultValue={selectedBlock.getType()} style={{ padding: '5px', borderRadius: '3px', fontSize: '12px' }}>
              <option value="">Cambia tipo...</option>
              <option value="grass">Erba</option>
              <option value="dirt">Terra</option>
              <option value="stone">Pietra</option>
              <option value="sand">Sabbia</option>
              <option value="snow">Neve</option>
              <option value="rock">Roccia</option>
            </select>
            <input type="color" onChange={(e) => handleBlockAction('color', e.target.value)} style={{ width: '40px', height: '28px', border: 'none', borderRadius: '3px', cursor: 'pointer' }} title="Cambia colore" />
          </div>
        </div>
      )}

      {isAnimating && hasStartedJourney && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'white', backgroundColor: 'rgba(0, 0, 0, 0.5)', padding: '10px 20px', borderRadius: '20px', fontSize: '14px', pointerEvents: 'none' }}>
          Spostamento...
        </div>
      )}

      <Canvas camera={{ position: [150, 80, 150], fov: 75 }} shadows gl={{ antialias: true }}>
        <AutoOrbitCamera
          isActive={!hasStartedJourney}
          onTransitionStart={handleTransitionStart}
        />

        <Sky sunPosition={[0.5, 0.8, 0.3]} />
        <ambientLight intensity={0.4} />

        <Suspense fallback={null}>
          <VoxelWorld
            ref={voxelWorldRef}
            onLoadingProgress={handleLoadingProgress}
            onBlockClick={handleBlockClick}
            onSignCameraMove={handleSignCameraMove}
          />
        </Suspense>

        {hasStartedJourney && (
          <CameraController
            lookAtTarget={cameraTarget}
            onComplete={handleAnimationComplete}
            voxelWorldRef={voxelWorldRef}
            transitionData={cameraTransitionData}
          />
        )}

        <BlockOutlineEffect block={selectedBlock} />
      </Canvas>
    </>
  )
}