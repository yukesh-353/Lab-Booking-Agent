'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      themes={['light', 'dark', 'amoled', 'ambient']}
    >
      <SessionProvider>{children}</SessionProvider>
    </ThemeProvider>
  )
}
