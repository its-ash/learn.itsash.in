export default defineNuxtPlugin(() => {
  if (!import.meta.client) return

  function applyDropCap() {
    const p = document.querySelector('.md-prose p:first-of-type') as HTMLElement | null
    if (!p || p.dataset.dropcap) return
    p.dataset.dropcap = '1'
    const lh = parseFloat(getComputedStyle(p).lineHeight)
    if (p.offsetHeight > lh * 1.5) {
      p.classList.add('has-dropcap')
    }
  }

  onNuxtReady(() => {
    applyDropCap()
    const observer = new MutationObserver(applyDropCap)
    observer.observe(document.body, { childList: true, subtree: true })
  })
})