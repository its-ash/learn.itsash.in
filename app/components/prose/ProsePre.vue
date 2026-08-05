<script setup lang="ts">
const props = defineProps<{
    code?: string
    language?: string
}>()

interface Rule { re: RegExp; cls: string }

const commonRules: Rule[] = [
    { re: /\/\/[^\n]*|#[^\n]*/g, cls: 'tok-cmt' },
    { re: /\/\*[\s\S]*?\*\//g, cls: 'tok-cmt' },
    { re: /"(?:[^"\\]|\\.)*"/g, cls: 'tok-str' },
    { re: /'(?:[^'\\]|\\.)*'/g, cls: 'tok-str' },
    { re: /`(?:[^`\\]|\\.)*`/g, cls: 'tok-str' },
    { re: /\b(true|false|null|nil|None|undefined|NaN)\b/g, cls: 'tok-lit' },
    { re: /\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, cls: 'tok-lit' },
    { re: /\b0x[0-9a-fA-F_]+\b/g, cls: 'tok-lit' },
    { re: /\b0b[01_]+\b/g, cls: 'tok-lit' },
    { re: /\b0o[0-7_]+\b/g, cls: 'tok-lit' },
]

const kwMap: Record<string, string[]> = {
    rust: ['as','async','await','break','const','continue','crate','dyn','else','enum','extern','false','fn','for','if','impl','in','let','loop','match','mod','move','mut','pub','ref','return','self','Self','static','struct','super','trait','true','type','unsafe','use','where','while','box','abstract','become','do','final','macro','override','priv','typeof','unsized','virtual','yield','try','union'],
    python: ['False','None','True','and','as','assert','async','await','break','class','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','nonlocal','not','or','pass','raise','return','try','while','with','yield','match','case'],
    javascript: ['break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends','finally','for','function','if','import','in','instanceof','let','new','return','super','switch','this','throw','try','typeof','var','void','while','with','yield','async','await','of','as','static','get','set'],
    typescript: ['break','case','catch','class','const','continue','debugger','declare','default','delete','do','else','enum','export','extends','finally','for','function','if','import','in','instanceof','interface','let','namespace','new','return','super','switch','this','throw','try','typeof','var','void','while','with','yield','async','await','of','as','static','get','set','type','readonly','keyof','infer','implements','private','protected','public','abstract','module','is','satisfies'],
    toml: ['true','false'],
    yaml: ['true','false','null','yes','no'],
    json: ['true','false','null'],
    bash: ['if','then','else','elif','fi','for','do','done','while','case','esac','function','in','return','local','export','unset','echo','printf','read','set','shift','exit','break','continue','cd','pwd','ls','cp','mv','rm','mkdir','rmdir','cat','grep','sed','awk','find','chmod','chown','source','alias','unalias','trap','test'],
    sql: ['SELECT','FROM','WHERE','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','ALTER','DROP','INDEX','VIEW','JOIN','LEFT','RIGHT','INNER','OUTER','ON','AS','AND','OR','NOT','NULL','IS','IN','LIKE','BETWEEN','ORDER','BY','GROUP','HAVING','LIMIT','OFFSET','DISTINCT','UNION','ALL','PRIMARY','KEY','FOREIGN','REFERENCES','DEFAULT','CONSTRAINT','UNIQUE','CHECK','CASCADE','BEGIN','COMMIT','ROLLBACK','TRANSACTION','TRUE','FALSE'],
    markdown: [],
}

const typeMap: Record<string, string[]> = {
    rust: ['i8','i16','i32','i64','i128','isize','u8','u16','u32','u64','u128','usize','f32','f64','bool','char','str','String','Vec','Option','Result','Box','Rc','Arc','RefCell','HashMap','HashSet','BTreeMap','BTreeSet','Cow'],
    python: ['int','float','str','bytes','list','dict','set','tuple','bool','object','type','complex','range','frozenset','bytearray','memoryview'],
    javascript: ['Array','Object','String','Number','Boolean','Symbol','Promise','Map','Set','WeakMap','WeakSet','Date','RegExp','Error','TypeError','RangeError','JSON','Math','console','window','document'],
    typescript: ['Array','Object','String','Number','Boolean','Symbol','Promise','Map','Set','WeakMap','WeakSet','Date','RegExp','Error','Record','Partial','Readonly','Pick','Omit','Awaited','Unknown','Never','Void'],
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function langKey(lang?: string): string {
    const l = (lang || '').toLowerCase()
    if (l === 'ts' || l === 'tsx') return 'typescript'
    if (l === 'js' || l === 'jsx' || l === 'mjs' || l === 'cjs') return 'javascript'
    if (l === 'py') return 'python'
    if (l === 'sh' || l === 'shell' || l === 'zsh') return 'bash'
    if (l === 'yml') return 'yaml'
    if (l === 'md') return 'markdown'
    return l
}

function buildRules(lang?: string): Rule[] {
    const key = langKey(lang)
    const rules: Rule[] = []

    const kws = kwMap[key]
    if (kws && kws.length) {
        const sorted = [...kws].sort((a, b) => b.length - a.length)
        const pattern = sorted.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
        rules.push({ re: new RegExp(`\\b(${pattern})\\b`, 'g'), cls: 'tok-kw' })
    }

    const types = typeMap[key]
    if (types && types.length) {
        const sorted = [...types].sort((a, b) => b.length - a.length)
        const pattern = sorted.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
        rules.push({ re: new RegExp(`\\b(${pattern})\\b`, 'g'), cls: 'tok-type' })
    }

    if (key === 'rust') {
        rules.push({ re: /\b([A-Z][A-Za-z0-9_]*)\b/g, cls: 'tok-type' })
        rules.push({ re: /\b([a-z_][A-Za-z0-9_]*)(?=\s*!)/g, cls: 'tok-fn' })
        rules.push({ re: /\b([a-z_][A-Za-z0-9_]*)(?=\s*\()/g, cls: 'tok-fn' })
    } else if (key === 'python' || key === 'javascript' || key === 'typescript') {
        rules.push({ re: /\b([A-Z][A-Za-z0-9_]*)\b/g, cls: 'tok-type' })
        rules.push({ re: /\b([a-z_$][A-Za-z0-9_$]*)(?=\s*\()/g, cls: 'tok-fn' })
    }

    if (key === 'markdown') {
        rules.push({ re: /^(#{1,6})\s+.+$/gm, cls: 'tok-kw' })
        rules.push({ re: /(\*\*[^*]+\*\*|__[^_]+__)/g, cls: 'tok-type' })
        rules.push({ re: /(\*[^*]+\*|_[^_]+_)/g, cls: 'tok-lit' })
        rules.push({ re: /(`[^`]+`)/g, cls: 'tok-str' })
        rules.push({ re: /^(\s*[-*+]\s)/gm, cls: 'tok-kw' })
        rules.push({ re: /^(\s*\d+\.\s)/gm, cls: 'tok-kw' })
        rules.push({ re: /^(\>\s?.*)$/gm, cls: 'tok-cmt' })
        rules.push({ re: /(\[[^\]]+\]\([^)]+\))/g, cls: 'tok-fn' })
    }

    rules.push(...commonRules)

    if (key === 'rust') {
        rules.push({ re: /\b([a-z_][A-Za-z0-9_]*)(?=\s*::)/g, cls: 'tok-def' })
    }

    rules.push({ re: /([A-Za-z_$][A-Za-z0-9_$]*)(?=\s*:)/g, cls: 'tok-def' })

    return rules
}

interface Span { start: number; end: number; cls: string }

const highlighted = computed(() => {
    const code = props.code || ''
    const lang = langKey(props.language)

    if (lang === 'plaintext' || lang === 'text' || lang === '') {
        if (!props.language) return escapeHtml(code)
    }

    const rules = buildRules(props.language)
    if (!rules.length) return escapeHtml(code)

    const spans: Span[] = []
    const occupied = new Uint8Array(code.length)

    for (const rule of rules) {
        rule.re.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = rule.re.exec(code)) !== null) {
            const start = m.index
            const end = start + m[0].length
            let overlap = false
            for (let i = start; i < end; i++) {
                if (occupied[i]) { overlap = true; break }
            }
            if (overlap) {
                if (m[0].length === 0) rule.re.lastIndex++
                continue
            }
            for (let i = start; i < end; i++) occupied[i] = 1
            spans.push({ start, end, cls: rule.cls })
            if (m[0].length === 0) rule.re.lastIndex++
        }
    }

    spans.sort((a, b) => a.start - b.start)

    let result = ''
    let pos = 0
    for (const span of spans) {
        if (span.start < pos) continue
        if (span.start > pos) result += escapeHtml(code.slice(pos, span.start))
        result += `<span class="${span.cls}">${escapeHtml(code.slice(span.start, span.end))}</span>`
        pos = span.end
    }
    if (pos < code.length) result += escapeHtml(code.slice(pos))
    return result
})
</script>

<template>
    <pre class="hl-pre"><code :class="language ? `language-${language}` : ''" v-html="highlighted" /></pre>
</template>

<style scoped>
.hl-pre {
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

.hl-pre code {
    font-family: inherit;
    background: transparent;
    border: none;
    padding: 0;
    color: inherit;
    white-space: pre;
}

.hl-pre :deep(.tok-kw) { font-weight: 700; }
.hl-pre :deep(.tok-fn) { font-weight: 600; }
.hl-pre :deep(.tok-def) { font-weight: 600; }
.hl-pre :deep(.tok-type) { font-weight: 600; opacity: 0.85; }
.hl-pre :deep(.tok-lit) { font-weight: 500; opacity: 0.85; }
.hl-pre :deep(.tok-str) { font-weight: 500; opacity: 0.85; }
.hl-pre :deep(.tok-cmt) { font-style: italic; opacity: 0.5; }
.hl-pre :deep(.tok-meta) { font-style: italic; opacity: 0.6; }
.hl-pre :deep(.tok-err) { text-decoration: underline; }
</style>