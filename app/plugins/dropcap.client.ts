export default defineNuxtPlugin(() => {
  if (!import.meta.client) return

  function applyDropCap(el: HTMLElement) {
    const p = el.querySelector('.md-prose p:first-of-type') as HTMLElement | null
    if (!p) return
    const lineHeight = parseFloat(getComputedStyle(p).lineHeight)
    const lines = p.offsetHeight / lineHeight
    p.classList.toggle('has-dropcap', lines >= 1)
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          if (node.classList?.contains('md-prose')) applyDropCap(node)
          const prose = node.querySelector?.('.md-prose')
          if (prose) applyDropCap(prose as HTMLElement)
        }
      })
    }
  })

  onNuxtReady(() => {
    document.querySelectorAll('.md-prose').forEach((el) => applyDropCap(el as HTMLElement))
    observer.observe(document.body, { childList: true, subtree: true })
  })
})