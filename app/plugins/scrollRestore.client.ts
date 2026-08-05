export default defineNuxtPlugin(() => {
  if (!import.meta.client) return

  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual'
  }

  const positions = new Map<string, number>()

  window.addEventListener('scroll', () => {
    positions.set(window.location.pathname, window.scrollY)
  }, { passive: true })

  const router = useRouter()

  router.afterEach((to, from) => {
    if (from.path === to.path) return

    const saved = positions.get(to.path)

    if (saved !== undefined) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, saved)
        })
      })
    } else {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, 0)
        })
      })
    }
  })
})