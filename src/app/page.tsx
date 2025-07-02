// app/page.tsx
import dynamic from 'next/dynamic'

const Scene = dynamic(() => import('./components/scene'))

export default function Home() {
  return (
    <main style={{ width: '100vw', height: '100vh' }}>
      <Scene />
    </main>
  )
}