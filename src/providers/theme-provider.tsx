// src/providers/theme-provider.tsx
"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { type ThemeProviderProps } from "next-themes"
import { VOThemeProvider } from "@/contexts/ThemeContext"

/**
 * Base ThemeProvider wrapping next-themes.
 * Used internally - prefer ThemeProviderWithVO for full Virtual Office theme support.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}

/**
 * Enhanced ThemeProvider with Virtual Office theme system.
 * Wraps next-themes with VOThemeProvider for full theme support.
 */
export function ThemeProviderWithVO({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <VOThemeProvider>
        {children}
      </VOThemeProvider>
    </NextThemesProvider>
  )
}