type ThemeMode = 'light' | 'dark' | 'warm'

const theme = ref<ThemeMode>('light')

export function useTheme() {
  function apply(mode: ThemeMode) {
    theme.value = mode
    if (import.meta.client) {
      const html = document.documentElement
      html.classList.remove('light', 'dark', 'warm')
      html.classList.add(mode)
      localStorage.setItem('theme-mode', mode)
    }
  }

  function init() {
    if (import.meta.client) {
      const saved = localStorage.getItem('theme-mode') as ThemeMode | null
      apply(saved || 'light')
    }
  }

  function cycle() {
    const order: ThemeMode[] = ['light', 'dark', 'warm']
    const next = order[(order.indexOf(theme.value) + 1) % order.length]
    apply(next)
  }

  return { theme, apply, init, cycle }
}