'use client'

import { OrbitControls } from "@react-three/drei"
import { useThree, useFrame } from '@react-three/fiber'
import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { VoxelWorldRef } from './voxel-words'

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface CameraControllerProps {
  lookAtTarget: THREE.Vector3 | null
  voxelWorldRef: React.RefObject<VoxelWorldRef | null>
  onComplete: () => void
  preferredDistance?: number
  transitionData?: {
    startPosition: THREE.Vector3
    startTarget: THREE.Vector3
  } | null
}

function CameraController({
  lookAtTarget,
  voxelWorldRef,
  onComplete,
  preferredDistance = 3,
  transitionData,
}: CameraControllerProps) {
  const { camera } = useThree()
  const controlsRef = useRef<any>(null)

  const animationRef = useRef({
    active: false,
    progress: 0,
    duration: 1.2,
    startPosition: new THREE.Vector3(),
    endPosition: new THREE.Vector3(),
    startQuaternion: new THREE.Quaternion(),
    endQuaternion: new THREE.Quaternion(),
    endLookAt: new THREE.Vector3(),
  })

  // Sistema di collisioni per la camera
  const checkCameraCollision = (position: THREE.Vector3): boolean => {
    const world = voxelWorldRef.current;
    if (!world) return false;

    // Controlla un'area più ampia intorno alla camera per evitare clipping
    const checkRadius = 1.5; // Raggio di controllo intorno alla camera
    const checks = [
      { x: 0, y: 0, z: 0 },           // Centro camera
      { x: checkRadius, y: 0, z: 0 }, // Destra
      { x: -checkRadius, y: 0, z: 0 },// Sinistra
      { x: 0, y: 0, z: checkRadius }, // Avanti
      { x: 0, y: 0, z: -checkRadius },// Dietro
      { x: 0, y: checkRadius, z: 0 }, // Sopra
      { x: 0, y: -checkRadius, z: 0 },// Sotto
    ];

    for (const offset of checks) {
      const checkX = Math.round(position.x + offset.x);
      const checkY = Math.round(position.y + offset.y);
      const checkZ = Math.round(position.z + offset.z);
      
      if (world.getBlock(checkX, checkY, checkZ)) {
        return true; // Collisione trovata
      }
    }

    return false;
  };

  // Trova una posizione sicura per la camera sopra il terreno
  const findSafePosition = (desiredPosition: THREE.Vector3): THREE.Vector3 => {
    const world = voxelWorldRef.current;
    if (!world) {
      return desiredPosition.clone();
    }

    // Inizia dalla posizione desiderata e sali fino a trovare spazio libero
    let safePosition = desiredPosition.clone();
    let attempts = 0;
    const maxAttempts = 50;

    while (checkCameraCollision(safePosition) && attempts < maxAttempts) {
      safePosition.y += 1; // Sali di un blocco
      attempts++;
    }

    // Se ancora in collisione, prova a spostarsi orizzontalmente
    if (attempts >= maxAttempts) {
      const horizontalOffsets = [
        { x: 2, z: 0 }, { x: -2, z: 0 }, { x: 0, z: 2 }, { x: 0, z: -2 },
        { x: 3, z: 0 }, { x: -3, z: 0 }, { x: 0, z: 3 }, { x: 0, z: -3 },
        { x: 2, z: 2 }, { x: -2, z: -2 }, { x: 2, z: -2 }, { x: -2, z: 2 },
      ];

      for (const offset of horizontalOffsets) {
        const testPos = desiredPosition.clone().add(new THREE.Vector3(offset.x, 5, offset.z));
        
        // Trova la superficie a questa posizione
        let surfaceY = testPos.y;
        for (let y = Math.floor(testPos.y); y >= 0; y--) {
          if (world.getBlock(Math.round(testPos.x), y, Math.round(testPos.z))) {
            surfaceY = y + 3; // 3 blocchi sopra la superficie
            break;
          }
        }
        
        testPos.y = surfaceY;
        
        if (!checkCameraCollision(testPos)) {
          return testPos;
        }
      }
    }

    return safePosition;
  };

  const findIdealSpot = (target: THREE.Vector3): THREE.Vector3 => {
    const world = voxelWorldRef.current;
    const MAX_WORLD_HEIGHT = 40;

    if (!world) {
      console.warn('World ref not available');
      return target.clone().add(new THREE.Vector3(0, 10, preferredDistance));
    }

    const currentCameraPosition = camera.position.clone();

    // Controlla se una posizione ha una visuale libera verso il target
    const isSpotValid = (pos: THREE.Vector3, targetPos: THREE.Vector3): boolean => {
      // Prima controlla le collisioni della camera
      if (checkCameraCollision(pos)) {
        return false;
      }

      // Poi controlla la linea di vista verso il target
      const distance = pos.distanceTo(targetPos);
      const steps = Math.ceil(distance * 2);
      
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const checkPoint = pos.clone().lerp(targetPos, t);
        const checkX = Math.round(checkPoint.x);
        const checkY = Math.round(checkPoint.y);
        const checkZ = Math.round(checkPoint.z);
        
        // Verifica che non sia il blocco target stesso
        const isTargetBlock = (
          checkX === Math.round(targetPos.x) && 
          checkY === Math.round(targetPos.y) && 
          checkZ === Math.round(targetPos.z)
        );
        
        if (!isTargetBlock && world.getBlock(checkX, checkY, checkZ)) {
          return false; // Visuale ostruita
        }
      }

      return true;
    };

    // Parametri di ricerca
    const cameraHeight = 2.5; // Altezza sicura sopra il terreno
    const minDistance = Math.max(5, preferredDistance * 0.5);

    // FASE 1: Trova l'altezza del terreno intorno al target
    const getTerrainHeight = (x: number, z: number): number => {
      for (let y = MAX_WORLD_HEIGHT; y >= 0; y--) {
        if (world.getBlock(Math.round(x), y, Math.round(z))) {
          return y + 1; // Un blocco sopra la superficie
        }
      }
      return target.y; // Fallback
    };

    // FASE 2: Prova le direzioni cardinali con altezza del terreno
    const cardinalDirections = [
      { dir: new THREE.Vector3(0, 0, 1), name: 'Sud' },
      { dir: new THREE.Vector3(0, 0, -1), name: 'Nord' },
      { dir: new THREE.Vector3(1, 0, 0), name: 'Est' },
      { dir: new THREE.Vector3(-1, 0, 0), name: 'Ovest' },
    ];

    for (const distance of [preferredDistance, preferredDistance - 2, preferredDistance + 2]) {
      if (distance < minDistance) continue;
      
      for (const { dir, name } of cardinalDirections) {
        const basePos = new THREE.Vector3(
          target.x + dir.x * distance,
          target.y,
          target.z + dir.z * distance
        );

        // Trova l'altezza del terreno a questa posizione
        const terrainHeight = getTerrainHeight(basePos.x, basePos.z);
        const potentialPos = new THREE.Vector3(
          basePos.x,
          Math.max(terrainHeight + cameraHeight, target.y + cameraHeight),
          basePos.z
        );

        if (isSpotValid(potentialPos, target)) {
          console.log(`Camera posizionata a ${name} a distanza ${distance}, altezza terreno: ${terrainHeight}`);
          return potentialPos;
        }
      }
    }

    // FASE 3: Prova con elevazioni maggiori
    const elevationOffsets = [5, 8, 12, 15, 20];
    for (const elevation of elevationOffsets) {
      for (let distance = preferredDistance; distance >= minDistance; distance -= 2) {
        for (const { dir, name } of cardinalDirections) {
          const basePos = new THREE.Vector3(
            target.x + dir.x * distance,
            target.y,
            target.z + dir.z * distance
          );

          const terrainHeight = getTerrainHeight(basePos.x, basePos.z);
          const potentialPos = new THREE.Vector3(
            basePos.x,
            Math.max(terrainHeight + elevation, target.y + elevation),
            basePos.z
          );

          if (isSpotValid(potentialPos, target)) {
            console.log(`Camera posizionata a ${name} con elevazione ${elevation}`);
            return potentialPos;
          }
        }
      }
    }

    // FASE 4: Prova le diagonali con controllo terreno
    const diagonalDirections = [
      new THREE.Vector3(1, 0, 1).normalize(),
      new THREE.Vector3(1, 0, -1).normalize(),
      new THREE.Vector3(-1, 0, -1).normalize(),
      new THREE.Vector3(-1, 0, 1).normalize(),
    ];

    for (let distance = preferredDistance; distance >= minDistance; distance -= 2) {
      for (const dir of diagonalDirections) {
        for (let elevation = 5; elevation <= 15; elevation += 5) {
          const basePos = new THREE.Vector3(
            target.x + dir.x * distance,
            target.y,
            target.z + dir.z * distance
          );

          const terrainHeight = getTerrainHeight(basePos.x, basePos.z);
          const potentialPos = new THREE.Vector3(
            basePos.x,
            Math.max(terrainHeight + elevation, target.y + elevation),
            basePos.z
          );

          if (isSpotValid(potentialPos, target)) {
            console.log(`Camera posizionata in diagonale con elevazione ${elevation}`);
            return potentialPos;
          }
        }
      }
    }

    // FASE 5: Vista dall'alto sicura
    const topDownPositions = [
      new THREE.Vector3(target.x, target.y + 25, target.z + 2),
      new THREE.Vector3(target.x + 2, target.y + 25, target.z),
      new THREE.Vector3(target.x, target.y + 30, target.z + 5),
      new THREE.Vector3(target.x, target.y + 35, target.z),
    ];

    for (const pos of topDownPositions) {
      const safePos = findSafePosition(pos);
      if (isSpotValid(safePos, target)) {
        console.log('Camera posizionata con vista dall\'alto sicura');
        return safePos;
      }
    }

    // FASE 6: Fallback finale con posizione molto sicura
    console.warn('Usando fallback di emergenza con controllo terreno');
    const fallbackPos = new THREE.Vector3(
      target.x, 
      Math.max(target.y + 30, MAX_WORLD_HEIGHT + 10), 
      target.z + 5
    );
    
    return findSafePosition(fallbackPos);
  };

  // Controllo continuo delle collisioni durante il movimento manuale
  useFrame(() => {
    if (!controlsRef.current || animationRef.current.active) return;
    
    const currentPos = camera.position.clone();
    if (checkCameraCollision(currentPos)) {
      // Se la camera è in collisione, spingila in una posizione sicura
      const safePos = findSafePosition(currentPos);
      camera.position.copy(safePos);
      if (controlsRef.current) {
        controlsRef.current.target.copy(camera.position.clone().add(new THREE.Vector3(0, 0, -5)));
      }
    }
  });

  useEffect(() => {
    // Gestisce la transizione iniziale dall'AutoOrbitCamera
    if (transitionData && controlsRef.current) {
      // Imposta la camera alla posizione di partenza dalla transizione
      camera.position.copy(transitionData.startPosition)
      camera.lookAt(transitionData.startTarget)
      
      // Configura i controlli per partire dalla posizione attuale
      controlsRef.current.target.copy(transitionData.startTarget)
      controlsRef.current.enabled = true
      controlsRef.current.update()
      
      console.log('Transizione smooth iniziata dalla posizione:', transitionData.startPosition)
    }
  }, [transitionData, camera])

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

      const tempLookAtMatrix = new THREE.Matrix4().lookAt(
        anim.endPosition,
        anim.endLookAt,
        camera.up
      )
      anim.endQuaternion.setFromRotationMatrix(tempLookAtMatrix)

      controlsRef.current.enabled = false
    }
  }, [lookAtTarget, voxelWorldRef, camera, preferredDistance])

  useFrame((state, delta) => {
    const anim = animationRef.current
    if (!anim.active) return

    anim.progress = Math.min(anim.progress + delta / anim.duration, 1)
    const easedProgress = easeInOutCubic(anim.progress)

    // Durante l'animazione, controlla sempre le collisioni
    const interpolatedPosition = new THREE.Vector3().lerpVectors(
      anim.startPosition, 
      anim.endPosition, 
      easedProgress
    );

    // Se la posizione interpolata causa collisioni, usa una posizione sicura
    if (checkCameraCollision(interpolatedPosition)) {
      const safePosition = findSafePosition(interpolatedPosition);
      camera.position.copy(safePosition);
    } else {
      camera.position.copy(interpolatedPosition);
    }

    camera.quaternion.slerpQuaternions(anim.startQuaternion, anim.endQuaternion, easedProgress)

    if (anim.progress >= 1) {
      anim.active = false
      
      // Assicurati che la posizione finale sia sicura
      const finalSafePosition = findSafePosition(anim.endPosition);
      camera.position.copy(finalSafePosition);
      camera.quaternion.copy(anim.endQuaternion)

      if (controlsRef.current) {
        controlsRef.current.target.copy(anim.endLookAt)
        controlsRef.current.enabled = true
      }
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
      minDistance={3}
      maxDistance={100}
    />
  )
}

export default CameraController