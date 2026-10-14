/** Rewrites Deno-style import specifiers (npm:, jsr:@supabase, esm.sh URLs) into versioned bare specifiers that Bun auto-installs. */
export function toBunImports(source: string): string {
  return source.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\2/g, (whole, lead: string, quote: string, spec: string) => {
    const bare = bareSpecifier(spec)
    return bare === spec ? whole : `${lead}${quote}${bare}${quote}`
  })
}

function bareSpecifier(spec: string): string {
  if (spec.startsWith('npm:')) return spec.slice(4)
  if (spec.startsWith('jsr:@supabase/')) return spec.slice(4)
  const esm = /^https:\/\/esm\.sh\/(?:v\d+\/)?([^?#]+)/.exec(spec)
  if (esm) return esm[1]
  return spec
}
