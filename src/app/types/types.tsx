import * as THREE from 'three'

export interface CameraControllerProps {
    lookAtTarget: THREE.Vector3 | null
    voxelWorldRef: React.RefObject<VoxelWorldRef | null>
    onComplete: () => void
    preferredDistance?: number
    transitionData?: {
        startPosition: THREE.Vector3
        startTarget: THREE.Vector3
    } | null
}

export interface SignContent {
    title: string
    body: string | string[] // può essere testo o lista di stringhe
    footer?: string
}

/** Opzioni per personalizzare l'aspetto del cartello */
export interface SignStyle {
    titleColor?: string
    bodyColor?: string
    footerColor?: string
    backgroundColor?: string
    fontFamily?: string // font pixelato
    panelWidth?: number
    panelHeight?: number
}

/** Props del componente Sign */
export interface SignProps {
    position: [number, number, number]
    rotation?: [number, number, number]
    scale?: number
    content: SignContent
    style?: SignStyle
    onInteract?: () => void
    onCameraMove?: (target: THREE.Vector3) => void
}

// --- COMPONENTE TESTO ---

export interface TextLineProps {
    text: string
    position: [number, number, number]
    fontSize: number
    color: string
    fontFamily: string
    anchorX?: 'left' | 'center' | 'right'
    maxWidth?: number
}

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
        if (this.worldRef && newType !== 'water') {
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
export type BlockClickCallback = (block: Block | null) => void
export type SignCameraMoveCallback = (target: THREE.Vector3) => void

export interface VoxelWorldProps {
    onLoadingProgress?: LoadingCallback
    onBlockClick?: BlockClickCallback
    onSignCameraMove?: SignCameraMoveCallback
}

export interface VoxelWorldRef {
    regenerate: () => void
    getSeed: () => number
    getRandomSurfaceBlocks: (count: number) => Block[]
    getRandomBlock: () => Block | null
    getBlock: (x: number, y: number, z: number) => Block | null
    isBlockVisible:(target: THREE.Vector3,camera: THREE.Camera) => boolean
    addSign: (signData: SignData) => void
    removeSign: (signId: string) => void
    getSigns: () => SignData[]
}

// Interface per i metodi interni
export interface VoxelWorldInstance {
    removeBlock: (position: { x: number; y: number; z: number }) => void
    changeBlock: (position: { x: number; y: number; z: number }, newType: string) => void
    addBlock: (position: { x: number; y: number; z: number }, type: string) => void
    setBlockColor: (position: { x: number; y: number; z: number }, color: string | number) => void
    setBlockOutline: (position: { x: number; y: number; z: number }, color: string | number, emissiveIntensity: number) => void
    removeBlockOutline: (position: { x: number; y: number; z: number }) => void
}

// Struttura per memorizzare info sui blocchi
export interface BlockData {
    position: { x: number; y: number; z: number }
    type: string
    color?: string | number
    outline?: {
        color: string | number
        emissiveIntensity: number
    }
}

export type LoadingCallback = (progress: number) => void

export interface WelcomeProps {
    hasStartedJourney: boolean;
    isWorldLoaded: boolean;
    setHasStartedJourney: (value: boolean) => void;
}

export interface SignData {
  id: string
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
  content: SignContent
  style?: SignStyle
}