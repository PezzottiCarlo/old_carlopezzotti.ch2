import { SignData } from "../types/types"

export const signsData: SignData[] = [
  {
    id: 'welcome-sign',
    position: [0, 15, -20],
    content: {
      title: 'BENVENUTO NEL MIO MONDO',
      body: [
        'Esplora questo mondo voxel',
        'Clicca sui blocchi per muoverti',
        'Trova tutti i cartelli nascosti',
        'Scopri la mia storia'
      ],
      footer: 'Creato con ❤️ e Three.js'
    },
    style: {
      titleColor: '#FFD700',
      bodyColor: '#FFFFFF',
      footerColor: '#888888'
    }
  },
  {
    id: 'about-me',
    position: [30, 18, 10],
    rotation: [0, -Math.PI / 4, 0],
    content: {
      title: 'CHI SONO',
      body: `Sono un sviluppatore creativo
Mi piace costruire mondi digitali
Amo sperimentare con WebGL
Creo esperienze interattive uniche`,
      footer: 'Portfolio 2024'
    },
    style: {
      backgroundColor: '#1a1a2e',
      titleColor: '#16213e',
      bodyColor: '#eee'
    }
  },
  {
    id: 'skills',
    position: [-25, 20, 25],
    rotation: [0, Math.PI / 3, 0],
    content: {
      title: 'LE MIE COMPETENZE',
      body: [
        'JavaScript/TypeScript',
        'React & Next.js',
        'Three.js & WebGL',
        'Node.js',
        'Game Development',
        'Creative Coding',
        'UI/UX Design',
        'Database Design'
      ],
      footer: 'In continuo apprendimento...'
    },
    style: {
      backgroundColor: '#2d3436',
      titleColor: '#00b894',
      bodyColor: '#dfe6e9'
    }
  },
  {
    id: 'projects',
    position: [15, 16, -35],
    content: {
      title: 'PROGETTI RECENTI',
      body: [
        'Mondo Voxel Interattivo',
        'Generatore Procedurale',
        'Sistema Particellare',
        'Physics Engine',
        'Audio Visualizer',
        'Shader Collection'
      ],
      footer: 'github.com/tuousername'
    },
    style: {
      backgroundColor: '#130f40',
      titleColor: '#f39c12',
      bodyColor: '#ecf0f1',
      footerColor: '#3498db'
    }
  },
  {
    id: 'contact',
    position: [-40, 22, -15],
    rotation: [0, Math.PI / 2, 0],
    scale: 1.2,
    content: {
      title: 'CONTATTAMI',
      body: `Email: hello@example.com
LinkedIn: /in/tuonome
Twitter: @tuohandle
Discord: TuoNome#1234`,
      footer: 'Sempre aperto a nuove opportunità!'
    },
    style: {
      backgroundColor: '#2c3e50',
      titleColor: '#e74c3c',
      bodyColor: '#ecf0f1',
      footerColor: '#95a5a6'
    }
  },
  {
    id: 'easter-egg',
    position: [50, 35, 50],
    rotation: [0, -Math.PI / 6, 0],
    scale: 0.8,
    content: {
      title: '🎮 EASTER EGG 🎮',
      body: [
        'Hai trovato il cartello segreto!',
        'Complimenti esploratore!',
        '',
        'Codice segreto: VOXEL2024'
      ],
      footer: '✨ Achievement Unlocked!'
    },
    style: {
      backgroundColor: '#6c5ce7',
      titleColor: '#ffeaa7',
      bodyColor: '#ffffff',
      footerColor: '#fd79a8'
    }
  }
]

// Funzione helper per ottenere un cartello per ID
export function getSignById(id: string): SignData | undefined {
  return signsData.find(sign => sign.id === id)
}

// Funzione helper per ottenere cartelli in un raggio specifico
export function getSignsInRadius(position: [number, number, number], radius: number): SignData[] {
  return signsData.filter(sign => {
    const dx = sign.position[0] - position[0]
    const dy = sign.position[1] - position[1]
    const dz = sign.position[2] - position[2]
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    return distance <= radius
  })
}