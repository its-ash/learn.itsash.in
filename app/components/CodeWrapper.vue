<script setup lang="ts">
import hljs from 'highlight.js/lib/core'
import rust from 'highlight.js/lib/languages/rust'
import python from 'highlight.js/lib/languages/python'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import markdown from 'highlight.js/lib/languages/markdown'
import sql from 'highlight.js/lib/languages/sql'
import ini from 'highlight.js/lib/languages/ini'
import xml from 'highlight.js/lib/languages/xml'
import cssLang from 'highlight.js/lib/languages/css'
import shell from 'highlight.js/lib/languages/shell'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import lua from 'highlight.js/lib/languages/lua'
import scala from 'highlight.js/lib/languages/scala'

hljs.registerLanguage('rust', rust)
hljs.registerLanguage('python', python)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('toml', ini)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', cssLang)
hljs.registerLanguage('shell', shell)
hljs.registerLanguage('sh', shell)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('lua', lua)
hljs.registerLanguage('scala', scala)

const props = defineProps<{
    language?: string
    filename?: string
}>()

const langMap: Record<string, string> = {
    rs: 'rust', py: 'python', ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    sh: 'shell', zsh: 'shell', yml: 'yaml', md: 'markdown', html: 'xml', toml: 'toml',
}

const resolvedLang = computed(() => {
    const l = (props.language || '').toLowerCase()
    return langMap[l] || l || 'plaintext'
})


const wrapperRef = ref<HTMLElement | null>(null)
const isDownloading = ref(false)

async function downloadAsImage() {
    if (!wrapperRef.value || isDownloading.value) return
    isDownloading.value = true
    try {
        const { default: html2canvas } = await import('html2canvas')
        const canvas = await html2canvas(wrapperRef.value, { useCORS: true, scale: 3, backgroundColor: null, logging: false,  allowTaint: true })
        const link = document.createElement('a')
        link.download = (props.filename || resolvedLang.value || 'code') + '.png'
        link.href = canvas.toDataURL('image/png')
        link.click()
    } catch (e) {
        console.error('Failed to capture code block:', e)
    } finally {
        isDownloading.value = false
    }
}
</script>

<template>
    <div class="code-wrapper-parent p-4" ref="wrapperRef">
        <div  class="code-wrapper">
            <div v-if="filename || language" class="code-header">
                <div class="flex items-center gap-2">
                    <span class="code-dot" />
                    <span class="code-dot" />
                    <span class="code-dot" />
                </div>
                <div class="flex items-center gap-3">
                    <span v-if="filename" class="code-filename">{{ filename }}</span>
                    <span v-else-if="language" class="code-lang">{{ resolvedLang }}</span>
                    <button data-html2canvas-ignore="true" type="button" class="code-download" :disabled="isDownloading"
                        :title="isDownloading ? 'Generating...' : 'Download as image'" @click="downloadAsImage">
                        <svg v-if="!isDownloading" xmlns="http://www.w3.org/2000/svg" width="14" height="14"
                            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span v-else class="code-spinner" />
                    </button>
                </div>
            </div>
            <slot />
        </div>
    </div>
</template>

<style scoped>
.code-wrapper-parent{
    background: var(--c-bg);
    border-radius: 0.5rem;
}
.code-wrapper {
    border: 1px solid var(--c-fg);
    overflow: hidden;
}

.code-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--c-fg);
    background: var(--c-bg);
}



.code-dot {
    width: 0.625rem;
    height: 0.625rem;
    border: 1.5px solid var(--c-fg);
}

.code-filename,
.code-lang {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--c-muted-fg);
}

.code-download {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: none;
    background: none;
    color: var(--c-fg);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.1s;
}

.code-download:hover:not(:disabled) {
    opacity: 1;
}

.code-download:disabled {
    cursor: wait;
}

.code-spinner {
    width: 0.75rem;
    height: 0.75rem;
    border: 1.5px solid var(--c-fg);
    border-top-color: transparent;
    border-radius: 50%;
    animation: code-spin 0.6s linear infinite;
}

@keyframes code-spin {
    to {
        transform: rotate(360deg);
    }
}

.code-wrapper :deep(pre) {
    margin: 0;
    border: none;
    border-radius: 0;
}

.code-wrapper :deep(.hljs) {
    background: var(--c-bg);
    color: var(--c-fg);
}
</style>