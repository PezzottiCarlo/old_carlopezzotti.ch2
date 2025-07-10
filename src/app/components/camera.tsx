// camera.tsx
'use client'

import { OrbitControls } from "@react-three/drei"
import { useThree, useFrame } from '@react-three/fiber'
import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { CameraControllerProps } from "../types/types"

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function CameraController({
  lookAtTarget,
  voxelWorldRef,
  onComplete,
  preferredDistance = 8,
  transitionData,
}: CameraControllerProps) {
  const { camera } = useThree()
  const controlsRef = useRef<any>(null)
  const previousValidPosition = useRef(new THREE.Vector3())

  const animationRef = useRef({
    active: false,
    progress: 0,
    duration: 1.5,
    startPosition: new THREE.Vector3(),
    endPosition: new THREE.Vector3(),
    startQuaternion: new THREE.Quaternion(),
    endQuaternion: new THREE.Quaternion(),
    endLookAt: new THREE.Vector3(),
  })

  // Sistema di collisioni semplificato - solo controllo diretto
  const checkCameraCollision = (position: THREE.Vector3): boolean => {
    const world = voxelWorldRef.current
    if (!world) return false

    const x = Math.round(position.x)
    const y = Math.round(position.y)
    const z = Math.round(position.z)
    
    return !!world.getBlock(x, y, z)
  }

  // Trova una posizione ideale per la camera
  const findIdealSpot = (target: THREE.Vector3): THREE.Vector3 => {
    const world = voxelWorldRef.current
    if (!world) {
      return target.clone().add(new THREE.Vector3(0, 10, preferredDistance))
    }

    // Direzioni da provare (priorità alle direzioni cardinali)
    const directions = [
      new THREE.Vector3(0, 0, preferredDistance),   // Sud
      new THREE.Vector3(0, 0, -preferredDistance),  // Nord
      new THREE.Vector3(preferredDistance, 0, 0),   // Est
      new THREE.Vector3(-preferredDistance, 0, 0),  // Ovest
      new THREE.Vector3(preferredDistance, 0, preferredDistance).normalize().multiplyScalar(preferredDistance),   // Sud-Est
      new THREE.Vector3(-preferredDistance, 0, preferredDistance).normalize().multiplyScalar(preferredDistance),  // Sud-Ovest
      new THREE.Vector3(preferredDistance, 0, -preferredDistance).normalize().multiplyScalar(preferredDistance),  // Nord-Est
      new THREE.Vector3(-preferredDistance, 0, -preferredDistance).normalize().multiplyScalar(preferredDistance), // Nord-Ovest
    ]

    // Altezze da provare
    const heights = [3, 6, 10, 15, 20]

    for (const height of heights) {
      for (const direction of directions) {
        const candidatePos = target.clone().add(direction).add(new THREE.Vector3(0, height, 0))
        
        if (!checkCameraCollision(candidatePos)) {
          // Verifica linea di vista verso il target
          const distance = candidatePos.distanceTo(target)
          const steps = Math.ceil(distance * 2)
          let clearView = true
          
          for (let i = 1; i < steps; i++) {
            const t = i / steps
            const checkPoint = candidatePos.clone().lerp(target, t)
            const checkX = Math.round(checkPoint.x)
            const checkY = Math.round(checkPoint.y)
            const checkZ = Math.round(checkPoint.z)
            
            // Non controllare il blocco target stesso
            if (checkX === Math.round(target.x) && 
                checkY === Math.round(target.y) && 
                checkZ === Math.round(target.z)) {
              continue
            }
            
            if (world.getBlock(checkX, checkY, checkZ)) {
              clearView = false
              break
            }
          }
          
          if (clearView) {
            return candidatePos
          }
        }
      }
    }

    // Fallback: posizione sicura molto in alto
    return target.clone().add(new THREE.Vector3(0, 25, 5))
  }

  // Controllo collisioni durante movimento manuale
  useFrame(() => {
    if (!controlsRef.current || animationRef.current.active) return
    
    const currentPos = camera.position.clone()
    
    if (checkCameraCollision(currentPos)) {
      // Invece di spostare la camera, impedisci il movimento ripristinando la posizione precedente
      camera.position.copy(previousValidPosition.current)
      if (controlsRef.current) {
        controlsRef.current.update()
      }
    } else {
      // Salva la posizione valida
      previousValidPosition.current.copy(currentPos)
    }
  })

  // Gestione transizione iniziale
  useEffect(() => {
    if (transitionData && controlsRef.current) {
      camera.position.copy(transitionData.startPosition)
      camera.lookAt(transitionData.startTarget)
      controlsRef.current.target.copy(transitionData.startTarget)
      controlsRef.current.enabled = true
      controlsRef.current.update()
      
      // Salva come posizione valida iniziale
      previousValidPosition.current.copy(transitionData.startPosition)
    }
  }, [transitionData, camera])

  // Inizia animazione verso target
  useEffect(() => {
    if (lookAtTarget && voxelWorldRef.current && controlsRef.current) {
      const anim = animationRef.current
      const idealPosition = findIdealSpot(lookAtTarget)

      anim.active = true
      anim.progress = 0
      anim.startPosition.copy(camera.position)
      anim.endPosition.copy(idealPosition)
      anim.startQuaternion.copy(camera.quaternion)
      anim.endLookAt.copy(lookAtTarget)

      // Calcola quaternion finale per guardare il target
      const tempLookAtMatrix = new THREE.Matrix4().lookAt(
        anim.endPosition,
        anim.endLookAt,
        camera.up
      )
      anim.endQuaternion.setFromRotationMatrix(tempLookAtMatrix)

      controlsRef.current.enabled = false
    }
  }, [lookAtTarget, voxelWorldRef, camera, preferredDistance])

  // Animazione frame per frame
  useFrame((state, delta) => {
    const anim = animationRef.current
    if (!anim.active) return

    anim.progress = Math.min(anim.progress + delta / anim.duration, 1)
    const easedProgress = easeInOutCubic(anim.progress)

    // Interpolazione posizione e rotazione
    camera.position.lerpVectors(anim.startPosition, anim.endPosition, easedProgress)
    camera.quaternion.slerpQuaternions(anim.startQuaternion, anim.endQuaternion, easedProgress)

    if (anim.progress >= 1) {
      anim.active = false
      camera.position.copy(anim.endPosition)
      camera.quaternion.copy(anim.endQuaternion)

      if (controlsRef.current) {
        controlsRef.current.target.copy(anim.endLookAt)
        controlsRef.current.enabled = true
        controlsRef.current.update()
      }
      
      // Salva la nuova posizione come valida
      previousValidPosition.current.copy(anim.endPosition)
      onComplete()
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      minDistance={2}
      maxDistance={50}
      maxPolarAngle={Math.PI * 0.8} // Limita la rotazione verso il basso
    />
  )
}

export default CameraController