const brightness = ref(100)

const MIN = 40
const MAX = 100
const STEP = 10

export function useBrightness() {
  function apply(v: number) {
    brightness.value = v
    if (import.meta.client) {
      document.documentElement.style.setProperty('--text-brightness', String(v / 100))
      localStorage.setItem('text-brightness', String(v))
    }
  }

  function init() {
    if (import.meta.client) {
      const saved = parseInt(localStorage.getItem('text-brightness') || '', 10)
      apply(Number.isNaN(saved) ? 100 : Math.min(MAX, Math.max(MIN, saved)))
    }
  }

  function increase() {
    apply(Math.min(MAX, brightness.value + STEP))
  }

  function decrease() {
    apply(Math.max(MIN, brightness.value - STEP))
  }

  return { brightness, init, increase, decrease }
}