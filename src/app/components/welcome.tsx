import React, { useEffect, useState } from 'react';

interface WelcomeProps {
    hasStartedJourney: boolean;
    isWorldLoaded: boolean;
    setHasStartedJourney: (value: boolean) => void;
}

export function Welcome({ hasStartedJourney,setHasStartedJourney, isWorldLoaded }: WelcomeProps) {
    return (
        <>
            {/* CSS per le animazioni */}
            <style jsx>{`
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                @keyframes scrollIndicator {
                    0% {
                        transform: translateX(-50%) translateY(0);
                        opacity: 1;
                    }
                    50% {
                        opacity: 1;
                    }
                    100% {
                        transform: translateX(-50%) translateY(20px);
                        opacity: 0;
                    }
                }
            `}</style>
            
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.6) 100%)',
                zIndex: 10,
                color: 'white',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                pointerEvents: hasStartedJourney ? 'none' : 'auto',
                opacity: hasStartedJourney ? 0 : 1,
                transition: 'opacity 1.5s ease-out'
            }}
            onClick={() => {
                    setHasStartedJourney(true);
                
            }}
            >
            <h1 style={{
                fontSize: '4rem',
                fontWeight: '200',
                letterSpacing: '0.2em',
                marginBottom: '1rem',
                textTransform: 'uppercase',
                opacity: 0,
                animation: 'fadeInUp 1.5s ease-out 0.5s forwards'
            }}>
                Carlo Pezzotti
            </h1>
            <p style={{
                fontSize: '1.2rem',
                fontWeight: '300',
                marginBottom: '4rem',
                opacity: 0,
                animation: 'fadeInUp 1.5s ease-out 0.8s forwards'
            }}>
                Esplora il mio mondo
            </p>
            {isWorldLoaded && (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '1rem',
                    opacity: 0,
                    animation: 'fadeInUp 1.5s ease-out 1.2s forwards'
                }}>
                    <div style={{
                        width: '30px',
                        height: '50px',
                        border: '2px solid rgba(255, 255, 255, 0.8)',
                        borderRadius: '15px',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: '4px',
                            height: '10px',
                            background: 'white',
                            borderRadius: '2px',
                            position: 'absolute',
                            left: '50%',
                            top: '8px',
                            transform: 'translateX(-50%)',
                            animation: 'scrollIndicator 2s ease-in-out infinite'
                        }} />
                    </div>
                    <p style={{
                        fontSize: '0.9rem',
                        opacity: 0.8,
                        letterSpacing: '0.1em'
                    }}>
                        Scorri per iniziare
                    </p>
                </div>
            )}
        </div>
        </>
    )
} 
