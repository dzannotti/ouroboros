import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toBunImports } from '../../backend/deno-imports.ts'

test('toBunImports turns Deno specifiers into versioned bare imports', () => {
  const src = [
    `import { createClient } from 'npm:@supabase/supabase-js@2'`,
    `import { z } from "https://esm.sh/zod@3.23.8?target=deno"`,
    `import { corsHeaders } from '../_shared/cors.ts'`,
    `import Stripe from "jsr:@supabase/functions-js@2"`,
    `const m = await import('npm:date-fns@3/format')`,
    `import 'npm:dotenv@16/config'`,
  ].join('\n')
  assert.equal(
    toBunImports(src),
    [
      `import { createClient } from '@supabase/supabase-js@2'`,
      `import { z } from "zod@3.23.8"`,
      `import { corsHeaders } from '../_shared/cors.ts'`,
      `import Stripe from "@supabase/functions-js@2"`,
      `const m = await import('date-fns@3/format')`,
      `import 'dotenv@16/config'`,
    ].join('\n'),
  )
})
