// src/components/theme-toggle.tsx
"use client"

import * as React from "react"
import { ThemeSwitcher } from "@/components/ui/ThemeSwitcher"

/**
 * Theme toggle component for header/navigation.
 * Uses the Virtual Office theme switcher with full theme support.
 * @deprecated Use ThemeSwitcher directly for more control.
 */
export function ThemeToggle() {
  return <ThemeSwitcher align="end" side="bottom" />
}
