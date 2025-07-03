'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'

const Scene = dynamic(() => import('./components/scene'), { ssr: false })

export default function Home() {
  useEffect(() => {
    const preventDefault = (e: Event) => {
      e.preventDefault()
    }
    
    document.addEventListener('wheel', preventDefault, { passive: false })
    document.addEventListener('touchmove', preventDefault, { passive: false })
    
    return () => {
      document.removeEventListener('wheel', preventDefault)
      document.removeEventListener('touchmove', preventDefault)
    }
  }, [])
  
  return (
    <main style={{ 
      width: '100vw', 
      height: '100vh',
      position: 'fixed',
      top: 0,
      left: 0,
      overflow: 'hidden'
    }}>
      <Scene />
    </main>
  )
}