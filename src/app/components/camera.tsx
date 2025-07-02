'use client'

import { OrbitControls } from "@react-three/drei"
import { useThree, useFrame } from '@react-three/fiber'
import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { VoxelWorldRef } from './voxel-words'

const MAX_HEIGHT = 100


function CameraController({
  targetPosition,
  onComplete,
  voxelWorldRef,
}: {
  targetPosition: THREE.Vector3 | null
  onComplete: () => void
  voxelWorldRef: React.RefObject<VoxelWorldRef | null>
}) {
  const { camera, scene } = useThree()
  const controlsRef = useRef<any>(null)
  const animationRef = useRef({
    active: false,
    path: null as THREE.CubicBezierCurve3 | null,
    startQuaternion: new THREE.Quaternion(),
    endQuaternion: new THREE.Quaternion(),
    progress: 0,
    endTarget: new THREE.Vector3(),
    endPosition: new THREE.Vector3(),
  })
  const raycaster = useRef(new THREE.Raycaster()).current
  const cameraDistanceRef = useRef(20)

  useEffect(() => {
    if (targetPosition && controlsRef.current) {
      const startPosition = camera.position.clone()
      const endTarget = targetPosition.clone()
      const endDirection = new THREE.Vector3(0, 0.5, 1).normalize()
      const endDistance = 15
      const endPosition = endTarget.clone().add(endDirection.multiplyScalar(endDistance))

      const controlPoint1 = startPosition.clone().add(new THREE.Vector3(0, 20, 0))
      const controlPoint2 = endPosition.clone().add(new THREE.Vector3(0, 20, 0))
      controlPoint1.y = Math.max(controlPoint1.y, MAX_HEIGHT + 10)
      controlPoint2.y = Math.max(controlPoint2.y, MAX_HEIGHT + 10)

      const path = new THREE.CubicBezierCurve3(startPosition, controlPoint1, controlPoint2, endPosition)

      const tempLookAtMatrix = new THREE.Matrix4().lookAt(endPosition, endTarget, camera.up)
      const endQuaternion = new THREE.Quaternion().setFromRotationMatrix(tempLookAtMatrix)
      
      cameraDistanceRef.current = camera.position.distanceTo(controlsRef.current.target)

      animationRef.current = {
        active: true,
        path: path,
        startQuaternion: camera.quaternion.clone(),
        endQuaternion: endQuaternion,
        progress: 0,
        endTarget: endTarget,
        endPosition: endPosition
      }
    }
  }, [targetPosition, camera])

  useFrame((state, delta) => {
    const anim = animationRef.current
    if (!anim.active || !controlsRef.current || !anim.path) return

    anim.progress += delta * 0.6
    anim.progress = Math.min(anim.progress, 1)

    const t = anim.progress < 0.5 ? 4 * anim.progress * anim.progress * anim.progress : 1 - Math.pow(-2 * anim.progress + 2, 3) / 2

    const newPosition = anim.path.getPoint(t)
    const newTarget = controlsRef.current.target.lerp(anim.endTarget, delta * 4)
    
    const direction = newPosition.clone().sub(newTarget).normalize()
    if (direction.lengthSq() > 0) {
        let desiredDistance = newPosition.distanceTo(newTarget)
        let targetDistance = desiredDistance
        const worldGroup = scene.children.find(c => c.userData.isVoxelWorld)
        if (worldGroup) {
            raycaster.set(newTarget, direction)
            const intersects = raycaster.intersectObject(worldGroup, true)
            if (intersects.length > 0 && intersects[0].distance < desiredDistance) {
                targetDistance = Math.max(intersects[0].distance - 1, 5)
            }
        }
        cameraDistanceRef.current = THREE.MathUtils.lerp(cameraDistanceRef.current, targetDistance, delta * 5)
        const finalPosition = newTarget.clone().add(direction.multiplyScalar(cameraDistanceRef.current))
        camera.position.copy(finalPosition)
    } else {
        camera.position.copy(newPosition)
    }

    camera.quaternion.slerp(anim.endQuaternion, delta * 2.5)

    if (anim.progress >= 1) {
      anim.active = false
      camera.position.copy(anim.endPosition)
      camera.quaternion.copy(anim.endQuaternion)
      controlsRef.current.target.copy(anim.endTarget)
      onComplete()
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      enableZoom={false}
      enableRotate={false}
      minDistance={1}
      maxDistance={200}
      maxPolarAngle={Math.PI / 2.1}
    />
  )
}

export default CameraController