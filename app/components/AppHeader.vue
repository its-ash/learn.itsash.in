<script setup lang="ts">
const { theme, init, cycle } = useTheme()
const route = useRoute()

const links = [
    { label: 'Home', to: '/' },
    { label: 'Index', to: '/index' },
    { label: 'Rust', to: '/rust' },
]

const iconMap: Record<string, string> = {
    light: 'material-symbols:light-mode-outline',
    dark: 'material-symbols:dark-mode-outline',
    warm: 'material-symbols:wb-sunny-outline',
}

onMounted(init)
</script>

<template>
    <header class="sticky top-0 z-50 border-b border-c-fg bg-c-bg/95 backdrop-blur-sm">
        <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 md:px-8 lg:px-12">
            <NuxtLink to="/"
                class="font-serif text-2xl font-black tracking-tighter transition-opacity duration-100 hover:opacity-60">
                LEARN
            </NuxtLink>

            <nav class="flex items-center gap-2 md:gap-6">
                <button type="button" :aria-label="'Theme: ' + theme"
                    class="flex h-10 w-10 items-center justify-center border border-c-fg transition-colors duration-100 hover:bg-c-fg hover:text-c-bg focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3"
                    @click="cycle">
                    <Icon :name="iconMap[theme]" size="20" stroke-width="1.5" />
                </button>
            </nav>
        </div>
    </header>
</template>