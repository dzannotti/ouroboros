export const STYLE_GROUPS = {
  fontSize: /^text-(xs|sm|base|lg|xl|[2-9]xl)$/,
  fontWeight: /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/,
  textAlign: /^text-(left|center|right|justify|start|end)$/,
  textColor: /^text-(foreground|background|primary|primary-foreground|secondary|secondary-foreground|muted-foreground|accent-foreground|card-foreground|destructive|white|black|[a-z]+-\d{2,3})(\/\d+)?$/,
  bgColor: /^bg-(background|foreground|primary|secondary|muted|accent|card|destructive|transparent|white|black|[a-z]+-\d{2,3})(\/\d+)?$/,
  padding: /^p[xytrbl]?-(\d+(\.\d+)?|px|\[.+\])$/,
  radius: /^rounded(-(none|xs|sm|md|lg|xl|2xl|3xl|4xl|full))?$/,
} as const

export type StyleGroup = keyof typeof STYLE_GROUPS
export type StyleChanges = Partial<Record<StyleGroup, string | null>>

export function applyStyles(className: string, changes: StyleChanges): string {
  let classes = className.split(/\s+/).filter(Boolean)
  for (const [group, value] of Object.entries(changes) as [StyleGroup, string | null | undefined][]) {
    if (value === undefined) continue
    classes = classes.filter((c) => !STYLE_GROUPS[group].test(c))
    if (value) classes.push(value)
  }
  return classes.join(' ')
}

export function currentStyle(className: string, group: StyleGroup): string | undefined {
  return className.split(/\s+/).find((c) => STYLE_GROUPS[group].test(c))
}
