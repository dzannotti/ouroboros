const PENDING: Record<string, string> = {
  read_file: 'Reading file',
  write_file: 'Writing file',
  edit_file: 'Editing file',
  add_dependency: 'Installing packages',
  check_project: 'Checking for errors',
  generate_design_brief: 'Designing',
  generate_image: 'Generating image',
  fetch_url: 'Fetching page',
  run_command: 'Running command',
  screenshot: 'Looking at the app',
  enable_backend: 'Setting up backend',
  run_migration: 'Waiting for approval',
  request_secrets: 'Waiting for secrets',
}

const VERBS: Record<string, string> = { read_file: 'Reading', write_file: 'Writing', edit_file: 'Editing', delete_file: 'Deleting', generate_image: 'Generating' }

export const pendingLabel = (name: string) => PENDING[name] ?? name.replace(/_/g, ' ')

/** Label for a tool call whose JSON arguments are still streaming in, e.g. "Writing src/App.tsx · 84 lines". */
export function progressLabel(name: string, partialArgs: string): string {
  const verb = VERBS[name]
  const path = /"path"\s*:\s*"((?:[^"\\]|\\.)+)"/.exec(partialArgs)?.[1]
  if (!verb || !path) return pendingLabel(name)
  const content = name === 'write_file' ? partialArgs.slice(partialArgs.indexOf('"content"')) : ''
  const lines = content.startsWith('"content"') ? content.split('\\n').length : 0
  return `${verb} ${path}${lines > 1 ? ` · ${lines} lines` : ''}`
}
