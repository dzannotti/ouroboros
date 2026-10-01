import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Context, Next } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { Hono } from 'hono'
import * as oidc from 'openid-client'
import { config } from './config.ts'
import { sql } from './db.ts'

export type Role = 'admin' | 'user'
export type User = { id: string; subject: string; name: string; email: string | null; role: Role; picture: string | null }

const SESSION_COOKIE = 'ob_session'
const FLOW_COOKIE = 'ob_oidc'

const secret = config.auth.sessionSecret || randomBytes(32).toString('hex')
if (config.auth.mode === 'oidc' && !config.auth.sessionSecret) console.warn('[auth] SESSION_SECRET is not set — sign-in state is lost on restart')

export function sign(value: string): string {
  return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`
}

export function unsign(signed: string | undefined): string | null {
  if (!signed) return null
  const i = signed.lastIndexOf('.')
  if (i < 0) return null
  const value = signed.slice(0, i)
  const expected = Buffer.from(sign(value).slice(i + 1))
  const actual = Buffer.from(signed.slice(i + 1))
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? value : null
}

export type RoleOptions = Pick<typeof config.auth, 'roleClaim' | 'adminGroup' | 'userGroup' | 'defaultRole'>

export function roleFromClaims(claims: Record<string, unknown>, opts: RoleOptions = config.auth): Role | null {
  const role = claims[opts.roleClaim]
  if (role === 'admin' || role === 'user') return role
  if (role === 'none') return null
  const groups = Array.isArray(claims.groups) ? claims.groups.map(String) : typeof claims.groups === 'string' ? claims.groups.split('|') : []
  if (groups.includes(opts.adminGroup)) return 'admin'
  if (groups.includes(opts.userGroup)) return 'user'
  return opts.defaultRole === 'none' ? null : opts.defaultRole
}

async function upsertUser(who: { subject: string; name: string; email: string | null; role: Role; picture?: string | null }): Promise<User> {
  const [user] = await sql<User[]>`
    insert into users (subject, name, email, role, picture) values (${who.subject}, ${who.name}, ${who.email}, ${who.role}, ${who.picture ?? null})
    on conflict (subject) do update set name = excluded.name, email = excluded.email, role = excluded.role, picture = excluded.picture
    returning id, subject, name, email, role, picture`
  return user
}

const remoteAddress = (c: Context) => ((c.env as { incoming?: IncomingMessage } | undefined)?.incoming?.socket.remoteAddress ?? '').replace(/^::ffff:/, '')

async function headerUser(c: Context): Promise<User | null> {
  if (config.auth.trustedProxies.length && !config.auth.trustedProxies.includes(remoteAddress(c))) return null
  const subject = c.req.header('x-authentik-uid') ?? c.req.header('x-authentik-username') ?? c.req.header('remote-user')
  if (!subject) return null
  const email = c.req.header('x-authentik-email') ?? c.req.header('remote-email') ?? null
  const role = roleFromClaims({ groups: c.req.header('x-authentik-groups') ?? '' })
  if (!role) throw new HTTPException(403, { message: 'You do not have access to Ouroboros' })
  return upsertUser({ subject: `header:${subject}`, name: c.req.header('x-authentik-name') || c.req.header('x-authentik-username') || subject, email, role })
}

async function sessionUser(c: Context): Promise<User | null> {
  const id = unsign(getCookie(c, SESSION_COOKIE))
  if (!id) return null
  const [user] = await sql<User[]>`
    select u.id, u.subject, u.name, u.email, u.role, u.picture from sessions s join users u on u.id = s.user_id
    where s.id = ${id} and s.expires_at > now()`
  return user ?? null
}

export async function auth(c: Context<{ Variables: { user: User } }>, next: Next) {
  let user: User | null = null
  if (config.auth.mode === 'oidc') user = await sessionUser(c)
  else if (config.auth.mode === 'header') user = await headerUser(c)
  else user = await upsertUser({ subject: `dev:${config.devUser ?? 'dev'}`, name: 'Developer', email: null, role: 'admin' })
  if (!user) throw new HTTPException(401, { message: 'Not signed in' })
  c.set('user', user)
  await next()
}

let discovered: Promise<oidc.Configuration> | null = null
function client() {
  const { issuer, clientId, clientSecret, allowHttp } = config.auth.oidc
  discovered ??= oidc
    .discovery(new URL(issuer), clientId, clientSecret, undefined, allowHttp ? { execute: [oidc.allowInsecureRequests] } : undefined)
    .catch((err: unknown) => {
      discovered = null
      throw err
    })
  return discovered
}

const baseUrl = (c: Context) => config.publicUrl ?? new URL(c.req.url).origin
const secure = (c: Context) => baseUrl(c).startsWith('https://')
const safeReturn = (to: string | undefined) => (to && to.startsWith('/') && !to.startsWith('//') ? to : '/')

const page = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;min-height:100svh;display:flex;align-items:center;justify-content:center;font:15px/1.5 ui-sans-serif,system-ui;background:#fafafa;color:#171717}main{max-width:420px;padding:24px;text-align:center}a{display:inline-block;margin-top:16px;padding:8px 14px;border-radius:8px;background:#171717;color:#fff;text-decoration:none}</style></head><body><main>${body}</main></body></html>`

export const authRoutes = new Hono()

authRoutes.get('/login', async (c) => {
  if (config.auth.mode !== 'oidc') return c.redirect(safeReturn(c.req.query('returnTo')))
  let cfg: oidc.Configuration
  try {
    cfg = await client()
  } catch (err) {
    console.warn('[auth] OIDC discovery failed', (err as Error).message)
    return c.html(page('Sign-in unavailable', '<h1>Sign-in is unavailable</h1><p>Ouroboros could not reach the sign-in service. Try again in a moment.</p><a href="/auth/login">Retry</a>'), 503)
  }
  const verifier = oidc.randomPKCECodeVerifier()
  const flow = { verifier, state: oidc.randomState(), nonce: oidc.randomNonce(), returnTo: safeReturn(c.req.query('returnTo')) }
  setCookie(c, FLOW_COOKIE, sign(Buffer.from(JSON.stringify(flow)).toString('base64url')), { httpOnly: true, sameSite: 'Lax', secure: secure(c), path: '/auth', maxAge: 600 })
  const url = oidc.buildAuthorizationUrl(cfg, {
    redirect_uri: `${baseUrl(c)}/auth/callback`,
    scope: config.auth.oidc.scopes,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state: flow.state,
    nonce: flow.nonce,
  })
  return c.redirect(url.href)
})

authRoutes.get('/callback', async (c) => {
  const raw = unsign(getCookie(c, FLOW_COOKIE))
  deleteCookie(c, FLOW_COOKIE, { path: '/auth' })
  if (!raw) return c.html(page('Sign-in expired', '<h1>Sign-in expired</h1><p>Please try again.</p><a href="/auth/login">Sign in</a>'), 400)
  const flow = JSON.parse(Buffer.from(raw, 'base64url').toString()) as { verifier: string; state: string; nonce: string; returnTo: string }
  const cfg = await client()
  const current = new URL(c.req.url)
  const callbackUrl = new URL(`${baseUrl(c)}/auth/callback${current.search}`)
  let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>
  try {
    tokens = await oidc.authorizationCodeGrant(cfg, callbackUrl, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce })
  } catch (err) {
    console.warn('[auth] callback failed', (err as Error).message)
    return c.html(page('Sign-in failed', `<h1>Sign-in failed</h1><p>${(err as Error).message.replace(/[<>&]/g, '')}</p><a href="/auth/login">Try again</a>`), 400)
  }
  const idClaims: Record<string, unknown> = tokens.claims() ?? {}
  const sub = String(idClaims.sub ?? '')
  const info = await oidc.fetchUserInfo(cfg, tokens.access_token, sub).catch(() => ({}))
  const claims: Record<string, unknown> = { ...idClaims, ...info }
  const role = roleFromClaims(claims)
  if (!role) {
    return c.html(
      page('No access', `<h1>No access to Ouroboros</h1><p>Your account is signed in but isn't allowed to use Ouroboros. Ask an admin to add you to <b>${config.auth.userGroup}</b>.</p><a href="/auth/logout">Sign out</a>`),
      403,
    )
  }
  const email = typeof claims.email === 'string' ? claims.email : null
  const name = String(claims.name ?? claims.preferred_username ?? email ?? sub)
  const picture = typeof claims.picture === 'string' && /^(https:|data:image\/)/.test(claims.picture) ? claims.picture : null
  const user = await upsertUser({ subject: `oidc:${email ?? sub}`, name, email, role, picture })
  const id = randomBytes(24).toString('base64url')
  const hours = config.auth.sessionHours
  await sql`insert into sessions (id, user_id, id_token, expires_at) values (${id}, ${user.id}, ${tokens.id_token ?? null}, now() + ${`${hours} hours`}::interval)`
  setCookie(c, SESSION_COOKIE, sign(id), { httpOnly: true, sameSite: 'Lax', secure: secure(c), path: '/', maxAge: hours * 3600 })
  return c.redirect(flow.returnTo)
})

authRoutes.get('/logout', async (c) => {
  const id = unsign(getCookie(c, SESSION_COOKIE))
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  let idToken: string | null = null
  if (id) {
    const [row] = await sql<{ idToken: string | null }[]>`delete from sessions where id = ${id} returning id_token`
    idToken = row?.idToken ?? null
  }
  if (config.auth.mode !== 'oidc') return c.redirect('/')
  try {
    const url = oidc.buildEndSessionUrl(await client(), { post_logout_redirect_uri: `${baseUrl(c)}/`, ...(idToken ? { id_token_hint: idToken } : {}) })
    return c.redirect(url.href)
  } catch {
    return c.html(page('Signed out', '<h1>Signed out</h1><a href="/auth/login">Sign in again</a>'))
  }
})

export function startSessionCleanup() {
  setInterval(() => void sql`delete from sessions where expires_at < now()`.catch(() => {}), 3600_000).unref()
}
