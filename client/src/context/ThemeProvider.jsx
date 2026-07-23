import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const ThemeContext = createContext()

function getSystemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [themeMode, setThemeModeState] = useState(() => {
    return localStorage.getItem('possbo-theme') || 'system'
  })

  const resolvedTheme = themeMode === 'system' ? getSystemTheme() : themeMode

  const applyTheme = useCallback((t) => {
    document.documentElement.setAttribute('data-theme', t)
  }, [])

  useEffect(() => {
    applyTheme(resolvedTheme)
    localStorage.setItem('possbo-theme', themeMode)
  }, [themeMode, resolvedTheme, applyTheme])

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    if (themeMode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme(getSystemTheme())
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [themeMode, applyTheme])

  const setTheme = (t) => setThemeModeState(t)
  const toggleTheme = () => setThemeModeState(prev => prev === 'dark' ? 'light' : 'dark')

  return (
    <ThemeContext.Provider value={{ theme: resolvedTheme, themeMode, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
