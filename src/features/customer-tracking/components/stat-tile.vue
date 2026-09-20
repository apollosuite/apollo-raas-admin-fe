<script setup lang="ts">
// The UI kit lives under `src/components/ui/**`, which the auto-import registers in a
// `Ui`-prefixed namespace. A feature component that renders a card therefore has to import
// it by path - the page already does - or the tag silently fails to resolve.
import { Card, CardContent } from '@/components/ui/card'

/**
 * One headline figure, with the sentence that keeps it honest underneath.
 *
 * A tile reports exactly one number. The Accounts page used to stack several readings inside
 * one tile as label/value rows, and no spacing made that look intentional - the card was
 * mostly empty whatever we did with it. Lists of short readings belong on a headline line;
 * a tile is for the one number that carries the row.
 */
defineProps<{
  label: string
  value: string
  /** A short note under the figure: the denominator, the split, or the caveat. */
  sub?: string
  /** Reserve the alarm colour for the number someone has to act on. */
  tone?: 'default' | 'destructive'
}>()
</script>

<template>
  <Card>
    <CardContent class="flex h-full flex-col gap-1 p-4">
      <p class="text-xs text-muted-foreground">
        {{ label }}
      </p>
      <p
        class="text-xl font-semibold tabular-nums sm:text-2xl"
        :class="tone === 'destructive' ? 'text-destructive' : ''"
      >
        {{ value }}
      </p>
      <p v-if="sub" class="text-xs text-muted-foreground">
        {{ sub }}
      </p>
    </CardContent>
  </Card>
</template>
