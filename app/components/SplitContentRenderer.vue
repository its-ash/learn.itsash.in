<script setup lang="ts">
import { toHast } from 'minimark/hast'

const props = defineProps<{
  value: any
}>()

type AstNode = { type: string; tag?: string; children?: AstNode[]; [key: string]: any }

const isCodeBlock = (node: AstNode) => node?.tag === 'code-wrapper'

interface Pair {
  prose: AstNode | null
  code: AstNode | null
}

const hastBody = computed(() => {
  const body = props.value?.body
  if (!body) return null
  if (body.type === 'minimal' || body.type === 'minimark') {
    return toHast({ type: 'minimark', value: body.value })
  }
  return body
})

const pairs = computed<Pair[]>(() => {
  const children: AstNode[] = hastBody.value?.children || []
  const result: Pair[] = []
  let proseBuffer: AstNode[] = []

  const flushProse = () => {
    if (proseBuffer.length) {
      result.push({ prose: { type: 'element', tag: 'div', props: {}, children: proseBuffer }, code: null })
      proseBuffer = []
    }
  }

  for (const node of children) {
    if (isCodeBlock(node)) {
      if (result.length && !result[result.length - 1]!.code && proseBuffer.length === 0) {
        result[result.length - 1]!.code = node
      } else {
        flushProse()
        result.push({ prose: null, code: node })
      }
    } else {
      proseBuffer.push(node)
    }
  }
  flushProse()

  return result
})

const hasCode = computed(() => pairs.value.some(p => p.code))

const rendererData = computed(() => {
  const { body, excerpt, ...rest } = props.value || {}
  return rest
})

const proseValue = (node: AstNode) => ({ ...rendererData.value, body: node })
const codeValue = (node: AstNode) => ({ ...rendererData.value, body: { type: 'root', children: [node] } })
</script>

<template>
  <div v-if="hasCode" class="split-content">
    <template v-for="(pair, i) in pairs" :key="i">
      <div v-if="pair.prose" class="split-prose" :style="{ gridRow: i + 1 }">
        <ContentRenderer :value="proseValue(pair.prose)" tag="div" />
      </div>
      <div v-if="pair.code" class="split-code" :style="{ gridRow: i + 1 }">
        <ContentRenderer :value="codeValue(pair.code)" tag="div" />
      </div>
    </template>
  </div>
  <ContentRenderer v-else :value="value" />
</template>

<style scoped>
.split-content {
  display: block;
}

.split-prose,
.split-code {
  min-width: 0;
}

.split-code {
  margin-block: 1.5rem;
}

@media (min-width: 1024px) {
  .split-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 3rem;
    align-items: start;
  }

  .split-prose {
    grid-column: 1;
  }

  .split-code {
    grid-column: 2;
    position: sticky;
    top: 6rem;
    margin-block: 0;
    align-self: start;
  }

  .split-prose + .split-code {
    margin-top: 0;
  }
}
</style>
