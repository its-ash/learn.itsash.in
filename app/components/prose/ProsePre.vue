<script setup lang="ts">
import { HighlightStyle, StreamLanguage } from '@codemirror/language'
import { highlightTree, tags as t } from '@lezer/highlight'
import { parser as rustParser } from '@lezer/rust'
import { parser as mdParser } from '@lezer/markdown'
import { parser as pyParser } from '@lezer/python'
import { parser as yamlParser } from '@lezer/yaml'
import { parser as jsonParser } from '@lezer/json'
import { parser as jsParser } from '@lezer/javascript'
import { toml as tomlMode } from '@codemirror/legacy-modes/mode/toml'
import { shell as shellMode } from '@codemirror/legacy-modes/mode/shell'
import { sql as sqlMode } from '@codemirror/legacy-modes/mode/sql'

const props = defineProps<{
    code?: string
    language?: string
}>()

const monoHighlight = HighlightStyle.define([
    { tag: t.keyword, class: 'tok-kw' },
    { tag: [t.function(t.variableName), t.labelName], class: 'tok-fn' },
    { tag: [t.definition(t.name), t.separator], class: 'tok-def' },
    { tag: [t.typeName, t.className], class: 'tok-type' },
    { tag: [t.number, t.string, t.bool, t.atom, t.unit], class: 'tok-lit' },
    { tag: [t.comment, t.lineComment, t.blockComment], class: 'tok-cmt' },
    { tag: t.meta, class: 'tok-meta' },
    { tag: t.invalid, class: 'tok-err' },
])

function getParser(lang?: string): any {
    switch (lang) {
        case 'rust': return rustParser
        case 'markdown': case 'md': return mdParser
        case 'python': case 'py': return pyParser
        case 'yaml': case 'yml': return yamlParser
        case 'json': return jsonParser
        case 'javascript': case 'js': case 'ts': case 'typescript': return jsParser
        case 'toml': return StreamLanguage.define(tomlMode).parser
        case 'bash': case 'sh': case 'shell': case 'zsh': return StreamLanguage.define(shellMode).parser
        case 'sql': return StreamLanguage.define(sqlMode).parser
        default: return null
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const highlighted = computed(() => {
    const code = props.code || ''
    const parser = getParser(props.language)
    if (!parser) return escapeHtml(code)

    const tree = parser.parse(code)
    let result = ''
    let pos = 0

    highlightTree(tree, monoHighlight, (from: number, to: number, cls: string | null) => {
        if (from > pos) result += escapeHtml(code.slice(pos, from))
        const text = code.slice(from, to)
        result += cls ? `<span class="${cls}">${escapeHtml(text)}</span>` : escapeHtml(text)
        pos = to
    })

    if (pos < code.length) result += escapeHtml(code.slice(pos))
    return result
})
</script>

<template>
    <pre class="cm-pre"><code :class="language ? `language-${language}` : ''" v-html="highlighted" /></pre>
</template>

<style scoped>
.cm-pre {
    margin-bottom: 1.5rem;
    overflow-x: auto;
    border: 1px solid var(--c-fg);
    padding: 1rem;
    font-family: var(--font-mono);
    font-size: 22px;
    line-height: 1.6;
    background: var(--c-bg);
    color: var(--c-fg);
}

.cm-pre code {
    font-family: inherit;
    background: transparent;
    border: none;
    padding: 0;
    color: inherit;
    white-space: pre;
}

.cm-pre :deep(.tok-kw) { font-weight: 700; }
.cm-pre :deep(.tok-fn) { font-weight: 600; }
.cm-pre :deep(.tok-def) { font-weight: 600; }
.cm-pre :deep(.tok-type) { font-weight: 600; opacity: 0.85; }
.cm-pre :deep(.tok-lit) { font-weight: 500; opacity: 0.85; }
.cm-pre :deep(.tok-cmt) { font-style: italic; opacity: 0.5; }
.cm-pre :deep(.tok-meta) { font-style: italic; opacity: 0.6; }
.cm-pre :deep(.tok-err) { text-decoration: underline; }
</style>