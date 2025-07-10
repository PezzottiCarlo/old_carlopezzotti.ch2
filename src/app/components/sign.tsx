// sign.tsx
'use client'

import React, { useRef, useState, useMemo, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { TextLineProps, SignProps, SignStyle } from '../types/types'

function TextLine({ text, position, fontSize, color, fontFamily, anchorX = 'center', maxWidth }: TextLineProps) {
  const memoizedPosition = useMemo(() => position, [position[0], position[1], position[2]])
  
  return (
    <Text
      position={memoizedPosition}
      fontSize={fontSize}
      color={color}
      font={fontFamily}
      anchorX={anchorX}
      anchorY="middle"
      maxWidth={maxWidth}
      textAlign={anchorX}
      renderOrder={1}
      material-toneMapped={false}
    >
      {text}
    </Text>
  )
}

function splitTextIntoColumns(text: string | string[], maxLinesPerColumn: number): string[][] {
  const lines = Array.isArray(text) ? text : text.split('\n')
  const columns: string[][] = []

  for (let i = 0; i < lines.length; i += maxLinesPerColumn) {
    columns.push(lines.slice(i, i + maxLinesPerColumn))
  }

  return columns
}

export function Sign({
  position,
  rotation = [0, 0, 0],
  scale = 1,
  content,
  style = {},
  onInteract,
  onCameraMove,
}: SignProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const [isHovered, setIsHovered] = useState(false)
  const [isVisible, setIsVisible] = useState(true) // Inizia visibile per evitare flash
  
  // Usa ref per evitare re-render frequenti
  const lastVisibilityCheck = useRef(0)
  const lastDistanceCheck = useRef(0)
  
  const memoizedPosition = useMemo(() => new THREE.Vector3(...position), [position[0], position[1], position[2]])
  const memoizedRotation = useMemo(() => rotation, [rotation[0], rotation[1], rotation[2]])

  const defaultStyle: Required<SignStyle> = useMemo(() => ({
    titleColor: style.titleColor || '#FFFFFF',
    bodyColor: style.bodyColor || '#E0E0E0',
    footerColor: style.footerColor || '#A0A0A0',
    backgroundColor: style.backgroundColor || '#2C1810',
    fontFamily: style.fontFamily || '/fonts/monobit.ttf', 
    panelWidth: style.panelWidth || 4,
    panelHeight: style.panelHeight || 2.5,
  }), [style])

  const dimensions = useMemo(() => {
    const scaledWidth = defaultStyle.panelWidth * scale
    const scaledHeight = defaultStyle.panelHeight * scale

    return {
      scaledWidth,
      scaledHeight,
      titleY: scaledHeight * 0.35,
      bodyStartY: scaledHeight * 0.1,
      footerY: -scaledHeight * 0.35,
      titleFontSize: 0.15 * scale,
      bodyFontSize: 0.1 * scale,
      footerFontSize: 0.08 * scale,
    }
  }, [defaultStyle.panelWidth, defaultStyle.panelHeight, scale])

  const bodyColumns = useMemo(() => {
    const maxLinesPerColumn = 8
    return splitTextIntoColumns(content.body, maxLinesPerColumn)
  }, [content.body])

  // Geometrie memoizzate
  const geometries = useMemo(() => ({
    panel: new THREE.BoxGeometry(dimensions.scaledWidth, dimensions.scaledHeight, 0.05 * scale),
    frame: new THREE.BoxGeometry(dimensions.scaledWidth * 1.1, dimensions.scaledHeight * 1.1, 0.08 * scale),
    stick: new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 2 * scale, 8),
  }), [dimensions.scaledWidth, dimensions.scaledHeight, scale])

  // Frame ottimizzato con throttling
  useFrame((state) => {
    if (!groupRef.current) return
    
    const currentTime = state.clock.elapsedTime
    
    // Throttle controllo visibilità a 5fps
    if (currentTime - lastVisibilityCheck.current > 0.2) {
      const distance = state.camera.position.distanceTo(groupRef.current.position)
      const newVisibility = distance < 25
      
      if (newVisibility !== isVisible) {
        setIsVisible(newVisibility)
      }
      
      lastVisibilityCheck.current = currentTime
    }
    
    // Animazione scala hover più dolce
    if (currentTime - lastDistanceCheck.current > 0.016) {
      const targetScale = isHovered ? 1.03 : 1
      const currentScale = groupRef.current.scale.x
      
      if (Math.abs(currentScale - targetScale) > 0.001) {
        groupRef.current.scale.lerp(
          new THREE.Vector3(targetScale, targetScale, targetScale),
          0.1
        )
      }
      
      lastDistanceCheck.current = currentTime
    }
  })

  // Handler ottimizzati
  const handleClick = useCallback((event: any) => {
    event.stopPropagation()
    // Rimuovi l'animazione automatica della camera - lascia che sia l'utente a controllare
    onInteract?.()
  }, [onInteract])

  const handlePointerEnter = useCallback((e: any) => {
    e.stopPropagation()
    setIsHovered(true)
  }, [])

  const handlePointerLeave = useCallback((e: any) => {
    e.stopPropagation()
    setIsHovered(false)
  }, [])

  // Componenti memoizzati
  const textContent = useMemo(() => (
    <group visible={isVisible} position={[0, 0, 0.03 * scale]}>
      <TextLine
        text={content.title}
        position={[0, dimensions.titleY, 0]}
        fontSize={dimensions.titleFontSize}
        color={defaultStyle.titleColor}
        fontFamily={defaultStyle.fontFamily}
        anchorX="center"
        maxWidth={dimensions.scaledWidth * 0.9}
      />

      {bodyColumns.map((column, colIndex) => {
        const columnX = bodyColumns.length > 1
          ? (dimensions.scaledWidth * 0.4) - (colIndex * dimensions.scaledWidth * 0.4)
          : dimensions.scaledWidth * 0.4

        return column.map((line, lineIndex) => (
          <TextLine
            key={`${colIndex}-${lineIndex}`}
            text={Array.isArray(content.body) ? `• ${line}` : line}
            position={[columnX, dimensions.bodyStartY - (lineIndex * dimensions.bodyFontSize * 1.5), 0]}
            fontSize={dimensions.bodyFontSize}
            color={defaultStyle.bodyColor}
            fontFamily={defaultStyle.fontFamily}
            anchorX="right"
            maxWidth={dimensions.scaledWidth * 0.45}
          />
        ))
      })}

      {content.footer && (
        <TextLine
          text={content.footer}
          position={[-dimensions.scaledWidth * 0.4, dimensions.footerY, 0]}
          fontSize={dimensions.footerFontSize}
          color={defaultStyle.footerColor}
          fontFamily={defaultStyle.fontFamily}
          anchorX="left"
          maxWidth={dimensions.scaledWidth * 0.8}
        />
      )}
    </group>
  ), [isVisible, scale, content, dimensions, defaultStyle, bodyColumns])

  const materials = useMemo(() => ({
    stick: <meshStandardMaterial color="#3E2723" roughness={0.8} />,
    frame: <meshStandardMaterial color="#5D4037" roughness={0.7} />,
    panel: <meshStandardMaterial color={defaultStyle.backgroundColor} />,
  }), [defaultStyle.backgroundColor])

  return (
    <group
      ref={groupRef}
      position={memoizedPosition}
      rotation={memoizedRotation}
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <mesh 
        geometry={geometries.stick} 
        position={[0, -dimensions.scaledHeight * 0.5 - scale, 0]} 
        castShadow 
        receiveShadow
      >
        {materials.stick}
      </mesh>

      <mesh 
        geometry={geometries.frame} 
        position={[0, 0, -0.02 * scale]} 
        castShadow 
        receiveShadow
      >
        {materials.frame}
      </mesh>

      <mesh geometry={geometries.panel} castShadow receiveShadow>
        {materials.panel}
      </mesh>

      {textContent}

      {isHovered && (
        <>
          <mesh position={[0, 0, -0.04 * scale]}>
            <boxGeometry args={[dimensions.scaledWidth * 1.15, dimensions.scaledHeight * 1.15, 0.1 * scale]} />
            <meshBasicMaterial color="#FFD700" transparent opacity={0.2} side={THREE.BackSide} />
          </mesh>
          <pointLight position={[0, 0, 0.5 * scale]} intensity={0.2} distance={3} color="#FFD700" />
        </>
      )}
    </group>
  )
}

export default Sign