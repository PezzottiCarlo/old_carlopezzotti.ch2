export const metadata = {
  title: 'Carlo Pezzotti',
  description: 'Esplora il mio mondo',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <style>{`
          html, body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            width: 100%;
            height: 100%;
            position: fixed;
            top: 0;
            left: 0;
          }
          #__next {
            width: 100%;
            height: 100%;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}