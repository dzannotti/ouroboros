import type { QuestionPart } from '@shared/types'
import { Check, MessageCircleQuestion } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function QuestionCard({ part, onAnswer }: { part: QuestionPart; onAnswer?: (text: string) => void }) {
  const [picked, setPicked] = useState<Record<number, string[]>>({})
  const toggle = (qi: number, label: string, multi?: boolean) =>
    setPicked((prev) => {
      const cur = prev[qi] ?? []
      return { ...prev, [qi]: multi ? (cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]) : [label] }
    })
  const complete = part.questions.every((_, i) => (picked[i]?.length ?? 0) > 0)
  const submit = () => onAnswer?.(part.questions.map((q, i) => `${q.question}\n→ ${(picked[i] ?? []).join(', ')}`).join('\n\n'))

  return (
    <div className={cn('flex flex-col gap-4 rounded-xl border bg-card p-4', onAnswer && 'border-selection')}>
      {part.questions.map((q, qi) => (
        <div key={qi} className="flex flex-col gap-2">
          <span className="flex items-start gap-2 text-sm font-medium">
            <MessageCircleQuestion className="mt-0.5 size-4 shrink-0" />
            {q.question}
          </span>
          <div className="flex flex-col gap-1.5">
            {q.options.map((o) => {
              const active = picked[qi]?.includes(o.label)
              return (
                <button
                  key={o.label}
                  type="button"
                  disabled={!onAnswer}
                  onClick={() => toggle(qi, o.label, q.multiSelect)}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors enabled:hover:bg-muted disabled:opacity-60',
                    active && 'border-selection bg-selection/5',
                  )}
                >
                  <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border', q.multiSelect && 'rounded', active && 'border-selection bg-selection text-selection-foreground')}>
                    {active && <Check className="size-3" />}
                  </span>
                  <span className="flex flex-col">
                    <span>{o.label}</span>
                    {o.description && <span className="text-xs text-muted-foreground">{o.description}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {onAnswer ? (
        <Button size="sm" className="self-end" disabled={!complete} onClick={submit}>
          Continue
        </Button>
      ) : (
        part.answered && <span className="self-end text-xs text-muted-foreground">Answered</span>
      )}
    </div>
  )
}
