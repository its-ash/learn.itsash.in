const size = ref(18)

const MIN = 14
const MAX = 28

export function useFontSize() {
  function apply(v: number) {
    size.value = v
    if (import.meta.client) {
      document.documentElement.style.fontSize = `${v}px`
      localStorage.setItem('font-size', String(v))
    }
  }

  function init() {
    if (import.meta.client) {
      const saved = parseInt(localStorage.getItem('font-size') || '', 10)
      apply(Number.isNaN(saved) ? 18 : Math.min(MAX, Math.max(MIN, saved)))
    }
  }

  function increase() {
    apply(Math.min(MAX, size.value + 1))
  }

  function decrease() {
    apply(Math.max(MIN, size.value - 1))
  }

  return { size, init, increase, decrease }
}