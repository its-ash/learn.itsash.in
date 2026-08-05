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

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
</script>

<template>
    <div class="code-wrapper">
        <div v-if="filename || language" class="code-header">
            <div class="flex items-center gap-2">
                <span class="code-dot" />
                <span class="code-dot" />
                <span class="code-dot" />
            </div>
            <span v-if="filename" class="code-filename">{{ filename }}</span>
            <span v-else-if="language" class="code-lang">{{ resolvedLang }}</span>
        </div>
        <slot />
    </div>
</template>

<style scoped>
.code-wrapper {
    margin-bottom: 1.5rem;
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