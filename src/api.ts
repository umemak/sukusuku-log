import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { parseCare, askAssistant, GeminiError, type GeminiEnv } from './gemini'
import { sendVerificationEmail, type EmailBindings } from './email'

export type Bindings = { DB: D1Database; PHOTOS: R2Bucket } & EmailBindings & GeminiEnv
type Vars = { familyId: string; memberId: string; role: 'editor' | 'viewer' }
type Env = { Bindings: Bindings; Variables: Vars }

const LOG_TYPES = [
  'breast', 'formula', 'expressed', 'sleep',
  'pee', 'poop', 'temp', 'bath', 'med', 'memo'
] as const

// 紛らわしい文字(0/O, 1/I/L)を除いた家族コード用の文字集合
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const now = () => Date.now()
const uuid = () => crypto.randomUUID()

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomCode(len = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

function randomVerificationCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000
  return String(n).padStart(6, '0')
}

const isValidEmail = (v: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 100
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  return s.slice(0, max)
}
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function requireEditor(c: Context<Env>) {
  if (c.get('role') === 'viewer') {
    return c.json({ error: '閲覧専用メンバーのため、記録や変更はできません' }, 403)
  }
  return null
}

const api = new Hono<Env>()

// ---------- 認証不要: 家族の作成・参加・メール認証 ----------

async function uniqueCode(db: D1Database): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = randomCode()
    const exists = await db.prepare('SELECT 1 FROM families WHERE code = ?').bind(code).first()
    if (!exists) return code
  }
  return ''
}

async function uniqueInviteCode(db: D1Database): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomCode()
    const exists = await db.prepare('SELECT 1 FROM invitations WHERE code = ?').bind(code).first()
    if (!exists) return code
  }
  return ''
}

// 家族新規作成のためのメール認証コード送信
api.post('/auth/send-code', async (c) => {
  const body = await readJson(c)
  const email = str(body.email, 100)?.toLowerCase()
  if (!email || !isValidEmail(email)) {
    return c.json({ error: '有効なメールアドレスを入力してください' }, 400)
  }

  const db = c.env.DB
  const t = now()

  // レートリミット: 同じメールアドレスへの送信は60秒に1回まで
  const recent = await db
    .prepare('SELECT created_at FROM email_verifications WHERE email = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1')
    .bind(email, t - 60000)
    .first<{ created_at: number }>()
  if (recent) {
    return c.json({ error: '認証コードを送信したばかりです。少し待ってから再送してください' }, 429)
  }

  const code = randomVerificationCode()
  const codeHash = await sha256(code)
  const id = uuid()
  const expiresAt = t + 10 * 60 * 1000 // 10分間有効

  await db
    .prepare('INSERT INTO email_verifications (id, email, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, email, codeHash, t, expiresAt)
    .run()

  try {
    await sendVerificationEmail(c.env, email, code)
  } catch (e: any) {
    return c.json({ error: e.message || '認証メールの送信に失敗しました' }, 500)
  }

  return c.json({ ok: true, expiresAt })
})

// 家族新規作成 (メール認証コード必須)
api.post('/families', async (c) => {
  const body = await readJson(c)
  const memberName = str(body.memberName, 30)
  const email = str(body.email, 100)?.toLowerCase()
  const code = str(body.code, 10)?.trim()
  if (!email || !isValidEmail(email)) return c.json({ error: '有効なメールアドレスを入力してください' }, 400)
  if (!code || code.length !== 6) return c.json({ error: '6桁の認証コードを入力してください' }, 400)
  if (!memberName) return c.json({ error: 'あなたの呼び名を入力してください' }, 400)

  const db = c.env.DB
  const t = now()

  // 最新の未認証コードを取得
  const verification = await db
    .prepare('SELECT id, code_hash, expires_at, attempts FROM email_verifications WHERE email = ? AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1')
    .bind(email)
    .first<{ id: string; code_hash: string; expires_at: number; attempts: number }>()

  if (!verification || verification.expires_at <= t) {
    return c.json({ error: '認証コードが見つからないか、有効期限が切れています。もう一度コードを送信してください' }, 400)
  }

  if (verification.attempts >= 5) {
    return c.json({ error: '入力試行回数が上限を超えました。もう一度認証コードを送信してください' }, 400)
  }

  const codeHash = await sha256(code)
  if (codeHash !== verification.code_hash) {
    await db.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?').bind(verification.id).run()
    const remaining = 4 - verification.attempts
    return c.json({
      error: remaining > 0 ? `認証コードが正しくありません (残り試行回数: ${remaining}回)` : '認証コードが正しくありません。再度送信してください'
    }, 400)
  }

  const familyId = uuid()
  const familyCode = await uniqueCode(db)
  if (!familyCode) return c.json({ error: '家族の作成に失敗しました。もう一度お試しください' }, 500)

  const token = randomToken()
  const memberId = uuid()

  await db.batch([
    db.prepare('UPDATE email_verifications SET verified_at = ? WHERE id = ?').bind(t, verification.id),
    db.prepare('INSERT INTO families (id, code, creator_email, created_at) VALUES (?, ?, ?, ?)').bind(familyId, familyCode, email, t),
    db.prepare('INSERT INTO members (id, family_id, name, token_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(memberId, familyId, memberName, await sha256(token), 'editor', t)
  ])

  return c.json({ token, memberId, role: 'editor' })
})

// 招待コードの事前検証(認証不要)
api.get('/invitations/check', async (c) => {
  const code = str(c.req.query('code'), 20)?.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!code) return c.json({ valid: false, error: 'コードが指定されていません' }, 400)
  const db = c.env.DB
  const t = now()
  const invite = await db
    .prepare('SELECT code, role, expires_at, used_at FROM invitations WHERE code = ?')
    .bind(code)
    .first<{ code: string; role: 'editor' | 'viewer'; expires_at: number; used_at: number | null }>()

  if (!invite) {
    return c.json({ valid: false, reason: 'not_found', error: '招待コードが見つかりません' }, 404)
  }
  if (invite.used_at != null) {
    return c.json({ valid: false, reason: 'used', error: 'この招待コードは既に使用されています' }, 400)
  }
  if (invite.expires_at <= t) {
    return c.json({ valid: false, reason: 'expired', error: 'この招待コードは有効期限が切れています' }, 400)
  }
  return c.json({ valid: true, role: invite.role, expiresAt: invite.expires_at })
})

api.post('/join', async (c) => {
  const body = await readJson(c)
  const memberName = str(body.memberName, 30)
  const code = str(body.code, 20)?.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!memberName) return c.json({ error: 'あなたの呼び名を入力してください' }, 400)
  if (!code) return c.json({ error: '招待コードを入力してください' }, 400)

  const db = c.env.DB
  const t = now()

  // 1. 招待コードの照合
  const invite = await db
    .prepare('SELECT code, family_id, role, created_at, expires_at, used_at FROM invitations WHERE code = ?')
    .bind(code)
    .first<{ code: string; family_id: string; role: 'editor' | 'viewer'; created_at: number; expires_at: number; used_at: number | null }>()

  if (!invite) {
    // 既存の古い共通家族コードで参加しようとした場合への親切な案内
    const oldFamily = await db.prepare('SELECT id FROM families WHERE code = ?').bind(code).first<{ id: string }>()
    if (oldFamily) {
      return c.json({
        error: '共通の家族コードでの参加は終了しました。すでに参加しているご家族の端末(「家族」タブ)から、新しいワンタイム招待コードを発行してもらってください'
      }, 400)
    }
    return c.json({ error: '招待コードが見つかりません。コードを確認してください' }, 404)
  }

  if (invite.used_at != null) {
    return c.json({ error: 'この招待コードは既に使用されています。新しいコードを発行してもらってください' }, 400)
  }

  if (invite.expires_at <= t) {
    return c.json({ error: 'この招待コードは有効期限が切れています。新しいコードを発行してもらってください' }, 400)
  }

  const familyId = invite.family_id
  const assignedRole = invite.role || 'editor'

  const token = randomToken()
  const tokenHash = await sha256(token)

  // 同じ呼び名のメンバーがいれば、その人の別の端末(PCなど)として追加する
  const existing = await db
    .prepare('SELECT id, name, role FROM members WHERE family_id = ? AND lower(name) = lower(?) ORDER BY created_at LIMIT 1')
    .bind(familyId, memberName)
    .first<{ id: string; name: string; role: string }>()

  if (existing) {
    await db.batch([
      db.prepare('INSERT INTO member_tokens (token_hash, member_id, created_at) VALUES (?, ?, ?)')
        .bind(tokenHash, existing.id, t),
      db.prepare('UPDATE invitations SET used_at = ?, used_by_member_id = ? WHERE code = ?')
        .bind(t, existing.id, code)
    ])
    return c.json({
      token,
      memberId: existing.id,
      role: existing.role || 'editor',
      linked: true,
      memberName: existing.name
    })
  }

  const memberId = uuid()
  await db.batch([
    db.prepare('INSERT INTO members (id, family_id, name, token_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(memberId, familyId, memberName, tokenHash, assignedRole, t),
    db.prepare('UPDATE invitations SET used_at = ?, used_by_member_id = ? WHERE code = ?')
      .bind(t, memberId, code)
  ])

  return c.json({ token, memberId, role: assignedRole, linked: false })
})

// ---------- 認証 ----------

api.use('*', async (c: Context<Env>, next: Next) => {
  const path = c.req.path
  if (
    path.endsWith('/families') ||
    path.endsWith('/join') ||
    path.endsWith('/invitations/check') ||
    path.endsWith('/auth/send-code')
  ) return next()
  const auth = c.req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return c.json({ error: 'unauthorized' }, 401)
  const hash = await sha256(token)
  let m = await c.env.DB
    .prepare('SELECT id, family_id, role FROM members WHERE token_hash = ?')
    .bind(hash)
    .first<{ id: string; family_id: string; role: string }>()
  if (!m) {
    // 追加端末の鍵
    m = await c.env.DB
      .prepare('SELECT m.id AS id, m.family_id AS family_id, m.role AS role FROM member_tokens t JOIN members m ON m.id = t.member_id WHERE t.token_hash = ?')
      .bind(hash)
      .first<{ id: string; family_id: string; role: string }>()
  }
  if (!m) return c.json({ error: 'unauthorized' }, 401)
  c.set('familyId', m.family_id)
  c.set('memberId', m.id)
  c.set('role', (m.role as 'editor' | 'viewer') || 'editor')
  return next()
})

// 自分・家族・メンバー・子どもをまとめて返す
api.get('/me', async (c) => {
  const db = c.env.DB
  const familyId = c.get('familyId')
  const [family, members, children] = await Promise.all([
    db.prepare('SELECT id, code FROM families WHERE id = ?').bind(familyId).first(),
    db.prepare('SELECT id, name, role FROM members WHERE family_id = ? ORDER BY created_at').bind(familyId).all(),
    db.prepare('SELECT id, name, birthday, gender FROM children WHERE family_id = ? ORDER BY birthday, created_at')
      .bind(familyId).all()
  ])
  return c.json({
    me: c.get('memberId'),
    role: c.get('role'),
    family,
    members: members.results,
    children: children.results
  })
})

api.put('/members/me', async (c) => {
  const body = await readJson(c)
  const name = str(body.name, 30)
  if (!name) return c.json({ error: '名前を入力してください' }, 400)
  await c.env.DB.prepare('UPDATE members SET name = ? WHERE id = ?').bind(name, c.get('memberId')).run()
  return c.json({ ok: true })
})

// メンバーのロール(権限)変更 (editor: 記録・閲覧 / viewer: 閲覧のみ)
api.put('/members/:id/role', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const id = c.req.param('id')
  const body = await readJson(c)
  const role = body.role === 'viewer' ? 'viewer' : body.role === 'editor' ? 'editor' : null
  if (!role) return c.json({ error: '役割が不正です' }, 400)

  const db = c.env.DB
  const fid = c.get('familyId')
  const target = await db.prepare('SELECT id, role FROM members WHERE id = ? AND family_id = ?').bind(id, fid).first<{ id: string; role: string }>()
  if (!target) return c.json({ error: 'メンバーが見つかりません' }, 404)

  if (target.role !== 'viewer' && role === 'viewer') {
    // 家族にエディターが1人しかいない場合、その人をviewerにすることはできない
    const editors = await db.prepare("SELECT COUNT(*) AS n FROM members WHERE family_id = ? AND role != 'viewer'").bind(fid).first<{ n: number }>()
    if ((editors?.n ?? 0) <= 1) {
      return c.json({ error: '家族に少なくとも1人は記録できるメンバーが必要です' }, 400)
    }
  }

  await db.prepare('UPDATE members SET role = ? WHERE id = ? AND family_id = ?').bind(role, id, fid).run()
  return c.json({ ok: true, role })
})

// 家族コードの再発行。古いコードは使えなくなる(参加済みの端末はそのまま使える)
api.post('/families/regenerate-code', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const code = await uniqueCode(c.env.DB)
  if (!code) return c.json({ error: '家族コードの生成に失敗しました。もう一度お試しください' }, 500)
  await c.env.DB.prepare('UPDATE families SET code = ? WHERE id = ?').bind(code, c.get('familyId')).run()
  return c.json({ code })
})

// 「はじめて使う」を間違えて押したときの取り消し。
// 家族が空(メンバー1人・お子さん0人)のときだけ、家族ごと削除できる
api.post('/families/discard', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const db = c.env.DB
  const fid = c.get('familyId')
  const members = await db.prepare('SELECT COUNT(*) AS n FROM members WHERE family_id = ?').bind(fid).first<{ n: number }>()
  const kids = await db.prepare('SELECT COUNT(*) AS n FROM children WHERE family_id = ?').bind(fid).first<{ n: number }>()
  if ((members?.n ?? 0) !== 1 || (kids?.n ?? 0) !== 0) {
    return c.json({ error: 'この家族にはすでにメンバーやお子さんがいるため、取り消せません。「連携を解除」を使ってください' }, 409)
  }
  await db.batch([
    db.prepare('DELETE FROM member_tokens WHERE member_id IN (SELECT id FROM members WHERE family_id = ?)').bind(fid),
    db.prepare('DELETE FROM ai_usage WHERE family_id = ?').bind(fid),
    db.prepare('DELETE FROM ai_chat_messages WHERE family_id = ?').bind(fid),
    db.prepare('DELETE FROM invitations WHERE family_id = ?').bind(fid),
    db.prepare('DELETE FROM members WHERE family_id = ?').bind(fid),
    db.prepare('DELETE FROM families WHERE id = ?').bind(fid)
  ])
  return c.json({ ok: true })
})

// メンバーの削除(自分自身は不可)。削除された端末は以後アクセスできない
api.delete('/members/:id', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const id = c.req.param('id')
  if (id === c.get('memberId')) return c.json({ error: '自分自身は削除できません。「連携を解除」を使ってください' }, 400)
  const r = await c.env.DB
    .prepare('DELETE FROM members WHERE id = ? AND family_id = ?')
    .bind(id, c.get('familyId'))
    .run()
  if (!r.meta.changes) return c.json({ error: 'not found' }, 404)
  await c.env.DB.prepare('DELETE FROM member_tokens WHERE member_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM ai_chat_messages WHERE member_id = ? AND family_id = ?').bind(id, c.get('familyId')).run()
  return c.json({ ok: true })
})

// ---------- 招待コード (ワンタイム・有効期限付き) ----------

// 家族の有効な招待一覧を取得
api.get('/invitations', async (c) => {
  const familyId = c.get('familyId')
  const t = now()
  const rows = await c.env.DB
    .prepare('SELECT code, role, created_at, expires_at FROM invitations WHERE family_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC')
    .bind(familyId, t)
    .all<{ code: string; role: 'editor' | 'viewer'; created_at: number; expires_at: number }>()
  return c.json({ invitations: rows.results || [] })
})

// 招待コードの発行 (editorのみ、24時間・1回限り有効)
api.post('/invitations', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied

  const body = await readJson(c)
  const role = body.role === 'viewer' ? 'viewer' : 'editor'
  const db = c.env.DB
  const code = await uniqueInviteCode(db)
  if (!code) return c.json({ error: '招待コードの生成に失敗しました。もう一度お試しください' }, 500)

  const t = now()
  const expiresAt = t + 24 * 60 * 60 * 1000 // 24時間有効
  const familyId = c.get('familyId')
  const memberId = c.get('memberId')

  await db
    .prepare('INSERT INTO invitations (code, family_id, created_by_member_id, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(code, familyId, memberId, role, t, expiresAt)
    .run()

  return c.json({ code, role, createdAt: t, expiresAt })
})

// 招待コードの取り消し (editorのみ)
api.delete('/invitations/:code', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied

  const code = str(c.req.param('code'), 20)?.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!code) return c.json({ error: 'コードが不正です' }, 400)

  const familyId = c.get('familyId')
  await c.env.DB
    .prepare('DELETE FROM invitations WHERE code = ? AND family_id = ? AND used_at IS NULL')
    .bind(code, familyId)
    .run()

  return c.json({ ok: true })
})

// ---------- 子ども ----------

api.post('/children', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const body = await readJson(c)
  const name = str(body.name, 30)
  if (!name) return c.json({ error: 'お子さんの名前を入力してください' }, 400)
  if (!isDate(body.birthday)) return c.json({ error: '生年月日(出産予定日・誕生日)を入力してください' }, 400)
  const gender = ['boy', 'girl', 'unknown'].includes(body.gender as string) ? (body.gender as string) : 'unknown'
  const id = uuid()
  await c.env.DB
    .prepare('INSERT INTO children (id, family_id, name, birthday, gender, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, c.get('familyId'), name, body.birthday, gender, now())
    .run()
  return c.json({ id, name, birthday: body.birthday, gender })
})

api.put('/children/:id', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const body = await readJson(c)
  const name = str(body.name, 30)
  if (!name) return c.json({ error: 'お子さんの名前を入力してください' }, 400)
  if (!isDate(body.birthday)) return c.json({ error: '生年月日を入力してください' }, 400)
  const gender = ['boy', 'girl', 'unknown'].includes(body.gender as string) ? (body.gender as string) : 'unknown'
  const r = await c.env.DB
    .prepare('UPDATE children SET name = ?, birthday = ?, gender = ? WHERE id = ? AND family_id = ?')
    .bind(name, body.birthday, gender, c.req.param('id'), c.get('familyId'))
    .run()
  if (!r.meta.changes) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})

api.delete('/children/:id', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const db = c.env.DB
  const id = c.req.param('id')
  const fid = c.get('familyId')
  const own = await db.prepare('SELECT 1 FROM children WHERE id = ? AND family_id = ?').bind(id, fid).first()
  if (!own) return c.json({ error: 'not found' }, 404)
  const photos = await db
    .prepare('SELECT photo_id FROM diary WHERE child_id = ? AND family_id = ? AND photo_id IS NOT NULL')
    .bind(id, fid)
    .all<{ photo_id: string }>()
  await db.batch([
    db.prepare('DELETE FROM logs WHERE child_id = ? AND family_id = ?').bind(id, fid),
    db.prepare('DELETE FROM growth WHERE child_id = ? AND family_id = ?').bind(id, fid),
    db.prepare('DELETE FROM vaccinations WHERE child_id = ? AND family_id = ?').bind(id, fid),
    db.prepare('DELETE FROM foods WHERE child_id = ? AND family_id = ?').bind(id, fid),
    db.prepare('DELETE FROM subsidy_done WHERE child_id = ? AND family_id = ?').bind(id, fid),
    db.prepare('DELETE FROM diary_comments WHERE family_id = ? AND diary_id IN (SELECT id FROM diary WHERE child_id = ?)').bind(fid, id),
    db.prepare('DELETE FROM diary WHERE child_id = ? AND family_id = ?').bind(id, fid),
    db.prepare('DELETE FROM ai_chat_messages WHERE child_id = ? AND family_id = ?').bind(id, fid),
    db.prepare('DELETE FROM children WHERE id = ? AND family_id = ?').bind(id, fid)
  ])
  const keys = photos.results.map((p) => `${fid}/${p.photo_id}`)
  if (keys.length) await c.env.PHOTOS.delete(keys)
  return c.json({ ok: true })
})

async function ownsChild(c: Context<Env>, childId: string): Promise<boolean> {
  const r = await c.env.DB
    .prepare('SELECT 1 FROM children WHERE id = ? AND family_id = ?')
    .bind(childId, c.get('familyId'))
    .first()
  return !!r
}

// ---------- 育児ログ ----------

const LOG_COLUMNS =
  'id, child_id, member_id, type, started_at, ended_at, amount, detail, note, updated_at'

api.get('/children/:id/logs', async (c) => {
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  const from = num(c.req.query('from')) ?? 0
  const to = num(c.req.query('to')) ?? now() + 86400000
  const limit = Math.min(Math.max(num(c.req.query('limit')) ?? 2000, 1), 5000)
  // 範囲内に開始したもの + 計測中(ended_at が NULL の睡眠・授乳)も含める
  const rs = await c.env.DB
    .prepare(
      `SELECT ${LOG_COLUMNS} FROM logs
       WHERE child_id = ? AND family_id = ? AND ((started_at >= ? AND started_at < ?) OR ended_at IS NULL AND type IN ('sleep','breast'))
       ORDER BY started_at DESC LIMIT ?`
    )
    .bind(childId, c.get('familyId'), from, to, limit)
    .all()
  return c.json({ logs: rs.results })
})

// 種類ごとの直近1件(「最後の授乳から○分」表示用)
api.get('/children/:id/last', async (c) => {
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  const rs = await c.env.DB
    .prepare(
      `SELECT ${LOG_COLUMNS} FROM logs l
       WHERE child_id = ? AND family_id = ?
         AND started_at = (SELECT MAX(started_at) FROM logs WHERE child_id = l.child_id AND type = l.type)
       ORDER BY started_at DESC`
    )
    .bind(childId, c.get('familyId'))
    .all()
  const last: Record<string, unknown> = {}
  for (const r of rs.results as Array<{ type: string }>) if (!(r.type in last)) last[r.type] = r
  return c.json({ last })
})

function normalizeLog(body: Record<string, unknown>) {
  const type = body.type as string
  if (!LOG_TYPES.includes(type as (typeof LOG_TYPES)[number])) return { error: '記録の種類が不正です' }
  const startedAt = num(body.started_at)
  if (startedAt === null || startedAt <= 0) return { error: '時刻が不正です' }
  const endedAt = num(body.ended_at)
  if (endedAt !== null && endedAt < startedAt) return { error: '終了時刻は開始時刻より後にしてください' }
  const amount = num(body.amount)
  if (type === 'temp' && amount !== null && (amount < 30 || amount > 45)) {
    return { error: '体温は30〜45℃の範囲で入力してください' }
  }
  if ((type === 'formula' || type === 'expressed') && amount !== null && (amount < 0 || amount > 1000)) {
    return { error: '量が不正です' }
  }
  let detail: string | null = null
  if (body.detail && typeof body.detail === 'object') {
    const s = JSON.stringify(body.detail)
    if (s.length > 1000) return { error: '詳細が長すぎます' }
    detail = s
  }
  return {
    value: {
      type,
      startedAt,
      endedAt,
      amount,
      detail,
      note: str(body.note, 500)
    }
  }
}

api.post('/children/:id/logs', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  const n = normalizeLog(await readJson(c))
  if ('error' in n) return c.json({ error: n.error }, 400)
  const v = n.value!
  const id = uuid()
  const t = now()
  await c.env.DB
    .prepare(
      `INSERT INTO logs (id, family_id, child_id, member_id, type, started_at, ended_at, amount, detail, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, c.get('familyId'), childId, c.get('memberId'), v.type, v.startedAt, v.endedAt, v.amount, v.detail, v.note, t, t)
    .run()
  return c.json({ id })
})

api.put('/logs/:id', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const n = normalizeLog(await readJson(c))
  if ('error' in n) return c.json({ error: n.error }, 400)
  const v = n.value!
  const r = await c.env.DB
    .prepare(
      `UPDATE logs SET type = ?, started_at = ?, ended_at = ?, amount = ?, detail = ?, note = ?, updated_at = ?
       WHERE id = ? AND family_id = ?`
    )
    .bind(v.type, v.startedAt, v.endedAt, v.amount, v.detail, v.note, now(), c.req.param('id'), c.get('familyId'))
    .run()
  if (!r.meta.changes) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})

api.delete('/logs/:id', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const r = await c.env.DB
    .prepare('DELETE FROM logs WHERE id = ? AND family_id = ?')
    .bind(c.req.param('id'), c.get('familyId'))
    .run()
  if (!r.meta.changes) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})

// ---------- 成長記録 ----------

api.get('/children/:id/growth', async (c) => {
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  const rs = await c.env.DB
    .prepare(
      `SELECT id, measured_on, weight_g, height_cm, head_cm, note FROM growth
       WHERE child_id = ? AND family_id = ? ORDER BY measured_on, created_at`
    )
    .bind(childId, c.get('familyId'))
    .all()
  return c.json({ growth: rs.results })
})

api.post('/children/:id/growth', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  const body = await readJson(c)
  if (!isDate(body.measured_on)) return c.json({ error: '測定日を入力してください' }, 400)
  const weight = num(body.weight_g)
  const height = num(body.height_cm)
  const head = num(body.head_cm)
  if (weight === null && height === null && head === null) {
    return c.json({ error: '体重・身長・頭囲のいずれかを入力してください' }, 400)
  }
  if (weight !== null && (weight < 300 || weight > 40000)) return c.json({ error: '体重(g)が範囲外です' }, 400)
  if (height !== null && (height < 20 || height > 150)) return c.json({ error: '身長(cm)が範囲外です' }, 400)
  if (head !== null && (head < 20 || head > 70)) return c.json({ error: '頭囲(cm)が範囲外です' }, 400)
  const id = uuid()
  await c.env.DB
    .prepare(
      `INSERT INTO growth (id, family_id, child_id, measured_on, weight_g, height_cm, head_cm, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, c.get('familyId'), childId, body.measured_on, weight === null ? null : Math.round(weight), height, head, str(body.note, 200), now())
    .run()
  return c.json({ id })
})

api.delete('/growth/:id', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const r = await c.env.DB
    .prepare('DELETE FROM growth WHERE id = ? AND family_id = ?')
    .bind(c.req.param('id'), c.get('familyId'))
    .run()
  if (!r.meta.changes) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})

// ---------- 予防接種 ----------

api.get('/children/:id/vaccinations', async (c) => {
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  const rs = await c.env.DB
    .prepare('SELECT vaccine_key, done_on FROM vaccinations WHERE child_id = ? AND family_id = ?')
    .bind(childId, c.get('familyId'))
    .all()
  return c.json({ vaccinations: rs.results })
})

api.put('/children/:id/vaccinations/:key', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  const key = c.req.param('key')
  if (!/^[a-z0-9_]{1,40}$/.test(key)) return c.json({ error: 'invalid key' }, 400)
  const body = await readJson(c)
  if (!isDate(body.done_on)) return c.json({ error: '接種日を入力してください' }, 400)
  await c.env.DB
    .prepare(
      `INSERT INTO vaccinations (child_id, family_id, vaccine_key, done_on) VALUES (?, ?, ?, ?)
       ON CONFLICT(child_id, vaccine_key) DO UPDATE SET done_on = excluded.done_on`
    )
    .bind(childId, c.get('familyId'), key, body.done_on)
    .run()
  return c.json({ ok: true })
})

api.delete('/children/:id/vaccinations/:key', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  await c.env.DB
    .prepare('DELETE FROM vaccinations WHERE child_id = ? AND family_id = ? AND vaccine_key = ?')
    .bind(childId, c.get('familyId'), c.req.param('key'))
    .run()
  return c.json({ ok: true })
})

// ---------- 補助・手続きの「申請済み」チェック ----------

const SUBSIDY_KEY = /^[a-z0-9_-]{1,40}$/

api.get('/children/:id/subsidies', async (c) => {
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  const rs = await c.env.DB
    .prepare('SELECT item_key, done_on, member_id FROM subsidy_done WHERE child_id = ? AND family_id = ?')
    .bind(childId, c.get('familyId'))
    .all()
  return c.json({ subsidies: rs.results })
})

api.put('/children/:id/subsidies/:key', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  const key = c.req.param('key')
  if (!SUBSIDY_KEY.test(key)) return c.json({ error: 'invalid key' }, 400)
  const body = await readJson(c)
  if (!isDate(body.done_on)) return c.json({ error: '日付が正しくありません' }, 400)
  await c.env.DB
    .prepare(
      `INSERT INTO subsidy_done (child_id, family_id, item_key, done_on, member_id) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(child_id, item_key) DO UPDATE SET done_on = excluded.done_on, member_id = excluded.member_id`
    )
    .bind(childId, c.get('familyId'), key, body.done_on, c.get('memberId'))
    .run()
  return c.json({ ok: true })
})

api.delete('/children/:id/subsidies/:key', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  await c.env.DB
    .prepare('DELETE FROM subsidy_done WHERE child_id = ? AND family_id = ? AND item_key = ?')
    .bind(childId, c.get('familyId'), c.req.param('key'))
    .run()
  return c.json({ ok: true })
})

// ---------- 離乳食・アレルギー ----------

const REACTIONS = ['ok', 'mild', 'severe']

api.get('/children/:id/foods', async (c) => {
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  const rs = await c.env.DB
    .prepare(
      `SELECT id, member_id, food, tried_on, reaction, note FROM foods
       WHERE child_id = ? AND family_id = ? ORDER BY tried_on DESC, created_at DESC LIMIT 1000`
    )
    .bind(childId, c.get('familyId'))
    .all()
  return c.json({ foods: rs.results })
})

api.post('/children/:id/foods', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  const body = await readJson(c)
  const food = str(body.food, 40)
  if (!food) return c.json({ error: '食材の名前を入力してください' }, 400)
  if (!isDate(body.tried_on)) return c.json({ error: '日付を入力してください' }, 400)
  const reaction = REACTIONS.includes(body.reaction as string) ? (body.reaction as string) : 'ok'
  const id = uuid()
  await c.env.DB
    .prepare(
      `INSERT INTO foods (id, family_id, child_id, member_id, food, tried_on, reaction, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, c.get('familyId'), childId, c.get('memberId'), food, body.tried_on, reaction, str(body.note, 200), now())
    .run()
  return c.json({ id })
})

api.delete('/foods/:id', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const r = await c.env.DB
    .prepare('DELETE FROM foods WHERE id = ? AND family_id = ?')
    .bind(c.req.param('id'), c.get('familyId'))
    .run()
  if (!r.meta.changes) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})

// ---------- 写真(R2) ----------

const MAX_PHOTO_BYTES = 4 * 1024 * 1024
const ID_RE = /^[0-9a-f-]{36}$/

// 画像はクライアントで縮小した JPEG のみ受け付ける(先頭バイトも検査)
api.post('/photos', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const len = Number(c.req.header('Content-Length') || 0)
  if (len > MAX_PHOTO_BYTES) return c.json({ error: '写真が大きすぎます(4MBまで)' }, 413)
  const buf = await c.req.arrayBuffer()
  if (buf.byteLength === 0) return c.json({ error: '写真が空です' }, 400)
  if (buf.byteLength > MAX_PHOTO_BYTES) return c.json({ error: '写真が大きすぎます(4MBまで)' }, 413)
  const b = new Uint8Array(buf, 0, 3)
  if (!(b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)) return c.json({ error: 'JPEG形式の写真のみ登録できます' }, 400)
  const photoId = uuid()
  await c.env.PHOTOS.put(`${c.get('familyId')}/${photoId}`, buf, { httpMetadata: { contentType: 'image/jpeg' } })
  return c.json({ photo_id: photoId })
})

api.get('/photos/:id', async (c) => {
  const id = c.req.param('id')
  if (!ID_RE.test(id)) return c.json({ error: 'not found' }, 404)
  const obj = await c.env.PHOTOS.get(`${c.get('familyId')}/${id}`)
  if (!obj) return c.json({ error: 'not found' }, 404)
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'image/jpeg',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=31536000, immutable'
    }
  })
})

// 日記に紐づいていない写真だけ削除できる(入力をキャンセルしたときの後始末)
api.delete('/photos/:id', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const id = c.req.param('id')
  if (!ID_RE.test(id)) return c.json({ error: 'not found' }, 404)
  const used = await c.env.DB
    .prepare('SELECT 1 FROM diary WHERE photo_id = ? AND family_id = ?')
    .bind(id, c.get('familyId'))
    .first()
  if (!used) await c.env.PHOTOS.delete(`${c.get('familyId')}/${id}`)
  return c.json({ ok: true })
})

// ---------- 思い出日記 ----------

api.get('/children/:id/diary', async (c) => {
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  const limit = Math.min(Math.max(num(c.req.query('limit')) ?? 100, 1), 300)
  const rs = await c.env.DB
    .prepare(
      `SELECT d.id, d.member_id, d.entry_date, d.body, d.photo_id,
        (SELECT COUNT(*) FROM diary_comments c WHERE c.diary_id = d.id AND c.family_id = d.family_id) AS comment_count
       FROM diary d
       WHERE d.child_id = ? AND d.family_id = ? ORDER BY d.entry_date DESC, d.created_at DESC LIMIT ?`
    )
    .bind(childId, c.get('familyId'), limit)
    .all()
  return c.json({ diary: rs.results })
})

api.post('/children/:id/diary', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  const body = await readJson(c)
  if (!isDate(body.entry_date)) return c.json({ error: '日付を入力してください' }, 400)
  const text = str(body.body, 2000)
  let photoId: string | null = null
  if (body.photo_id) {
    if (typeof body.photo_id !== 'string' || !ID_RE.test(body.photo_id)) return c.json({ error: '写真が不正です' }, 400)
    const head = await c.env.PHOTOS.head(`${c.get('familyId')}/${body.photo_id}`)
    if (!head) return c.json({ error: '写真が見つかりません。もう一度選択してください' }, 400)
    photoId = body.photo_id
  }
  if (!text && !photoId) return c.json({ error: '写真かひとことを入力してください' }, 400)
  const id = uuid()
  const t = now()
  await c.env.DB
    .prepare(
      `INSERT INTO diary (id, family_id, child_id, member_id, entry_date, body, photo_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, c.get('familyId'), childId, c.get('memberId'), body.entry_date, text, photoId, t, t)
    .run()
  return c.json({ id })
})

api.put('/diary/:id', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const body = await readJson(c)
  if (!isDate(body.entry_date)) return c.json({ error: '日付を入力してください' }, 400)
  const text = str(body.body, 2000)
  const cur = await c.env.DB
    .prepare('SELECT photo_id FROM diary WHERE id = ? AND family_id = ?')
    .bind(c.req.param('id'), c.get('familyId'))
    .first<{ photo_id: string | null }>()
  if (!cur) return c.json({ error: 'not found' }, 404)
  if (!text && !cur.photo_id) return c.json({ error: '写真かひとことを入力してください' }, 400)
  await c.env.DB
    .prepare('UPDATE diary SET entry_date = ?, body = ?, updated_at = ? WHERE id = ? AND family_id = ?')
    .bind(body.entry_date, text, now(), c.req.param('id'), c.get('familyId'))
    .run()
  return c.json({ ok: true })
})

api.delete('/diary/:id', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  const row = await c.env.DB
    .prepare('SELECT photo_id FROM diary WHERE id = ? AND family_id = ?')
    .bind(c.req.param('id'), c.get('familyId'))
    .first<{ photo_id: string | null }>()
  if (!row) return c.json({ error: 'not found' }, 404)
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM diary_comments WHERE diary_id = ? AND family_id = ?').bind(c.req.param('id'), c.get('familyId')),
    c.env.DB.prepare('DELETE FROM diary WHERE id = ? AND family_id = ?').bind(c.req.param('id'), c.get('familyId'))
  ])
  if (row.photo_id) await c.env.PHOTOS.delete(`${c.get('familyId')}/${row.photo_id}`)
  return c.json({ ok: true })
})

// ---------- 写真・思い出日記へのコメント(閲覧専用ユーザーも投稿可能) ----------

api.get('/diary/:id/comments', async (c) => {
  const diaryId = c.req.param('id')
  if (!ID_RE.test(diaryId)) return c.json({ error: 'not found' }, 404)
  const fid = c.get('familyId')
  const diary = await c.env.DB
    .prepare('SELECT 1 FROM diary WHERE id = ? AND family_id = ?')
    .bind(diaryId, fid)
    .first()
  if (!diary) return c.json({ error: 'not found' }, 404)

  const rs = await c.env.DB
    .prepare(
      `SELECT id, diary_id, member_id, comment, created_at
       FROM diary_comments
       WHERE diary_id = ? AND family_id = ?
       ORDER BY created_at ASC`
    )
    .bind(diaryId, fid)
    .all()
  return c.json({ comments: rs.results })
})

api.post('/diary/:id/comments', async (c) => {
  const diaryId = c.req.param('id')
  if (!ID_RE.test(diaryId)) return c.json({ error: 'not found' }, 404)
  const fid = c.get('familyId')
  const diary = await c.env.DB
    .prepare('SELECT 1 FROM diary WHERE id = ? AND family_id = ?')
    .bind(diaryId, fid)
    .first()
  if (!diary) return c.json({ error: 'not found' }, 404)

  const body = await readJson(c)
  const text = str(body.comment, 1000)
  if (!text) return c.json({ error: 'コメントを入力してください' }, 400)

  const id = uuid()
  const t = now()
  await c.env.DB
    .prepare(
      `INSERT INTO diary_comments (id, family_id, diary_id, member_id, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, fid, diaryId, c.get('memberId'), text, t)
    .run()

  return c.json({
    comment: {
      id,
      diary_id: diaryId,
      member_id: c.get('memberId'),
      comment: text,
      created_at: t
    }
  })
})

api.delete('/diary/comments/:id', async (c) => {
  const commentId = c.req.param('id')
  if (!ID_RE.test(commentId)) return c.json({ error: 'not found' }, 404)
  const fid = c.get('familyId')
  const row = await c.env.DB
    .prepare('SELECT id, member_id FROM diary_comments WHERE id = ? AND family_id = ?')
    .bind(commentId, fid)
    .first<{ id: string; member_id: string }>()
  if (!row) return c.json({ error: 'not found' }, 404)

  const isMine = row.member_id === c.get('memberId')
  const isEditor = c.get('role') === 'editor'
  if (!isMine && !isEditor) {
    return c.json({ error: '他のメンバーのコメントは削除できません' }, 403)
  }

  await c.env.DB
    .prepare('DELETE FROM diary_comments WHERE id = ? AND family_id = ?')
    .bind(commentId, fid)
    .run()
  return c.json({ ok: true })
})

// ---------- AI(音声・文章 → 記録の候補) ----------
// APIキーはサーバーのシークレットにだけ置く。家族ごとに1日あたりの回数を制限する。

const AI_DAILY_LIMIT = 40
const MAX_AUDIO_BYTES = 3 * 1024 * 1024
const AUDIO_MIMES = ['audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp3', 'audio/mpeg', 'audio/aac', 'audio/m4a', 'audio/mp4', 'audio/x-m4a', 'audio/flac']

const jstDay = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

function localNowText(tzMin: number): string {
  const d = new Date(Date.now() - tzMin * 60000) // getTimezoneOffset は UTC との差(分)で、日本は -540
  const wd = '日月火水木金土'[d.getUTCDay()]
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} (${wd}曜日)`
}

async function aiUsed(db: D1Database, familyId: string): Promise<number> {
  const r = await db.prepare('SELECT count FROM ai_usage WHERE family_id = ? AND day = ?').bind(familyId, jstDay()).first<{ count: number }>()
  return r?.count ?? 0
}

api.get('/ai/status', async (c) => {
  const enabled = !!c.env.GEMINI_API_KEY
  const used = enabled ? await aiUsed(c.env.DB, c.get('familyId')) : 0
  return c.json({ enabled, limit: AI_DAILY_LIMIT, remaining: Math.max(0, AI_DAILY_LIMIT - used) })
})

api.post('/ai/parse', async (c) => {
  const denied = requireEditor(c)
  if (denied) return denied
  if (!c.env.GEMINI_API_KEY) return c.json({ error: 'AI機能はまだ設定されていません' }, 503)
  const familyId = c.get('familyId')
  const tz = Math.max(-840, Math.min(840, num(c.req.query('tz')) ?? -540))

  // 入力の検証(回数を消費する前に弾く)
  const ct = (c.req.header('Content-Type') || '').split(';')[0].trim().toLowerCase()
  let input: Parameters<typeof parseCare>[1]
  if (ct === 'application/json') {
    const body = await readJson(c)
    const text = str(body.text, 500)
    if (!text) return c.json({ error: '文章を入力してください' }, 400)
    input = { kind: 'text', text }
  } else if (AUDIO_MIMES.includes(ct)) {
    const len = Number(c.req.header('Content-Length') || 0)
    if (len > MAX_AUDIO_BYTES) return c.json({ error: '録音が長すぎます。30秒以内でお試しください' }, 413)
    const data = await c.req.arrayBuffer()
    if (data.byteLength < 1000) return c.json({ error: '録音が短すぎます。もう一度お試しください' }, 400)
    if (data.byteLength > MAX_AUDIO_BYTES) return c.json({ error: '録音が長すぎます。30秒以内でお試しください' }, 413)
    input = { kind: 'audio', mime: ct === 'audio/mpeg' ? 'audio/mp3' : ct, data }
  } else {
    return c.json({ error: '対応していない入力です' }, 415)
  }

  // 回数を先に確保(同時リクエストでも超えないよう、加算してから判定)
  const quota = await reserveAi(c.env.DB, familyId)
  if (!quota.ok) {
    return c.json({ error: `AI入力は1日${AI_DAILY_LIMIT}回までです。明日またお使いください(手入力は何度でもできます)` }, 429)
  }

  try {
    const result = await parseCare(c.env, input, localNowText(tz))
    return c.json({ ...result, remaining: quota.remaining })
  } catch (e) {
    await quota.refund()
    if (e instanceof GeminiError) return c.json({ error: e.userMessage }, e.status as 502 | 503 | 504)
    throw e
  }
})

// 家族×日の利用回数を1つ確保する。上限超えなら確保せずに ok:false
async function reserveAi(db: D1Database, familyId: string) {
  const day = jstDay()
  const row = await db
    .prepare(
      `INSERT INTO ai_usage (family_id, day, count) VALUES (?, ?, 1)
       ON CONFLICT(family_id, day) DO UPDATE SET count = count + 1 RETURNING count`
    )
    .bind(familyId, day)
    .first<{ count: number }>()
  const refund = async () => {
    await db.prepare('UPDATE ai_usage SET count = MAX(count - 1, 0) WHERE family_id = ? AND day = ?').bind(familyId, day).run()
  }
  const count = row?.count ?? 1
  if (count > AI_DAILY_LIMIT) {
    await refund()
    return { ok: false as const }
  }
  return { ok: true as const, remaining: Math.max(0, AI_DAILY_LIMIT - count), refund }
}

// ---------- AIアシスタント(対話・成長レター) ----------
// 履歴はメンバー本人だけが読める。端末をまたいで引き継げるようD1に保存し、直近50件だけ残す(ADR 0003)

const CHAT_KEEP = 50
const CHAT_HISTORY_TURNS = 10

type ChatRow = { id: string; role: 'user' | 'model'; content: string; is_letter: number; created_at: number }

api.get('/ai/chat', async (c) => {
  const childId = c.req.query('child') || ''
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  const rs = await c.env.DB
    .prepare(
      `SELECT id, role, content, is_letter, created_at FROM ai_chat_messages
       WHERE member_id = ? AND family_id = ? AND child_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .bind(c.get('memberId'), c.get('familyId'), childId, CHAT_KEEP)
    .all<ChatRow>()
  return c.json({ messages: rs.results.reverse().map((m) => ({ ...m, is_letter: !!m.is_letter })) })
})

api.delete('/ai/chat', async (c) => {
  await c.env.DB
    .prepare('DELETE FROM ai_chat_messages WHERE member_id = ? AND family_id = ?')
    .bind(c.get('memberId'), c.get('familyId'))
    .run()
  return c.json({ ok: true })
})

// 閲覧専用メンバーも使える(記録は変更しない)。回数枠は家族で共有
api.post('/ai/chat', async (c) => {
  if (!c.env.GEMINI_API_KEY) return c.json({ error: 'AI機能はまだ設定されていません' }, 503)
  const familyId = c.get('familyId')
  const memberId = c.get('memberId')
  const tz = Math.max(-840, Math.min(840, num(c.req.query('tz')) ?? -540))
  const body = await readJson(c)
  const childId = typeof body.childId === 'string' ? body.childId : ''
  const text = str(body.text, 500)
  if (!text) return c.json({ error: '質問を入力してください' }, 400)
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)

  const db = c.env.DB
  const hist = await db
    .prepare(
      `SELECT role, content FROM ai_chat_messages
       WHERE member_id = ? AND family_id = ? AND child_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .bind(memberId, familyId, childId, CHAT_HISTORY_TURNS)
    .all<{ role: 'user' | 'model'; content: string }>()
  const history = hist.results.reverse()
  while (history.length && history[0].role !== 'user') history.shift() // 会話は必ず user から始める

  const quota = await reserveAi(db, familyId)
  if (!quota.ok) return c.json({ error: `AIの利用は1日${AI_DAILY_LIMIT}回までです(家族全体)。明日またお使いください` }, 429)

  let result: Awaited<ReturnType<typeof askAssistant>>
  try {
    const context = await buildAssistantContext(db, familyId, childId, tz)
    result = await askAssistant(c.env, history, text, localNowText(tz), context)
  } catch (e) {
    await quota.refund()
    if (e instanceof GeminiError) return c.json({ error: e.userMessage }, e.status as 502 | 503 | 504)
    throw e
  }

  const t = now()
  const userMsg = { id: uuid(), role: 'user' as const, content: text, is_letter: false, created_at: t }
  const modelMsg = { id: uuid(), role: 'model' as const, content: result.reply, is_letter: result.isLetter, created_at: t + 1 }
  const ins = db.prepare(
    'INSERT INTO ai_chat_messages (id, family_id, member_id, child_id, role, content, is_letter, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
  await db.batch([
    ins.bind(userMsg.id, familyId, memberId, childId, 'user', userMsg.content, 0, userMsg.created_at),
    ins.bind(modelMsg.id, familyId, memberId, childId, 'model', modelMsg.content, modelMsg.is_letter ? 1 : 0, modelMsg.created_at),
    // メンバーごとに直近50件だけ残す
    db
      .prepare(
        `DELETE FROM ai_chat_messages WHERE member_id = ? AND id NOT IN
         (SELECT id FROM ai_chat_messages WHERE member_id = ? ORDER BY created_at DESC LIMIT ?)`
      )
      .bind(memberId, memberId, CHAT_KEEP)
  ])
  return c.json({ messages: [userMsg, modelMsg], remaining: quota.remaining })
})

// AIに渡す記録の要約を組み立てる(1回の呼び出しで答えられるよう、よく聞かれる範囲をまとめて渡す)
async function buildAssistantContext(db: D1Database, familyId: string, childId: string, tzMin: number): Promise<string> {
  const t = now()
  const DAY = 86400000
  const off = -tzMin * 60000 // ローカル時刻 = UTC + off
  const p2 = (n: number) => String(n).padStart(2, '0')
  const fmt = (ms: number) => {
    const d = new Date(ms + off)
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${'日月火水木金土'[d.getUTCDay()]}) ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`
  }
  const localDayStart = (ms: number) => Math.floor((ms + off) / DAY) * DAY - off
  const todayStart = localDayStart(t)
  const from31 = todayStart - 30 * DAY
  const ymd31 = new Date(from31 + off).toISOString().slice(0, 10)

  const [child, members, lastRs, logsRs, diaryRs, growthRs, foodsRs, vacRs] = await Promise.all([
    db.prepare('SELECT name, birthday, gender FROM children WHERE id = ? AND family_id = ?').bind(childId, familyId)
      .first<{ name: string; birthday: string; gender: string }>(),
    db.prepare('SELECT id, name FROM members WHERE family_id = ?').bind(familyId).all<{ id: string; name: string }>(),
    db.prepare(
      `SELECT type, started_at, ended_at, amount, detail, note, member_id FROM logs l
       WHERE child_id = ? AND family_id = ?
         AND started_at = (SELECT MAX(started_at) FROM logs WHERE child_id = l.child_id AND type = l.type)`
    ).bind(childId, familyId).all<LogRow>(),
    db.prepare(
      `SELECT type, started_at, ended_at, amount, detail, note, member_id FROM logs
       WHERE child_id = ? AND family_id = ? AND (started_at >= ? OR (ended_at IS NULL AND type IN ('sleep','breast')))
       ORDER BY started_at ASC LIMIT 3000`
    ).bind(childId, familyId, from31 - DAY).all<LogRow>(),
    db.prepare('SELECT entry_date, body FROM diary WHERE child_id = ? AND family_id = ? AND entry_date >= ? ORDER BY entry_date DESC LIMIT 20')
      .bind(childId, familyId, ymd31).all<{ entry_date: string; body: string | null }>(),
    db.prepare('SELECT measured_on, weight_g, height_cm, head_cm FROM growth WHERE child_id = ? AND family_id = ? ORDER BY measured_on DESC LIMIT 4')
      .bind(childId, familyId).all<{ measured_on: string; weight_g: number | null; height_cm: number | null; head_cm: number | null }>(),
    db.prepare('SELECT food, tried_on, reaction FROM foods WHERE child_id = ? AND family_id = ? AND tried_on >= ? ORDER BY tried_on DESC LIMIT 40')
      .bind(childId, familyId, ymd31).all<{ food: string; tried_on: string; reaction: string }>(),
    db.prepare('SELECT vaccine_key, done_on FROM vaccinations WHERE child_id = ? AND family_id = ? AND done_on >= ? ORDER BY done_on DESC')
      .bind(childId, familyId, ymd31).all<{ vaccine_key: string; done_on: string }>()
  ])
  if (!child) return '(お子さんの情報がありません)'

  const who = new Map(members.results.map((m) => [m.id, m.name]))
  const out: string[] = []

  const days = Math.floor((todayStart - (Date.parse(child.birthday + 'T00:00:00Z') - off)) / DAY)
  const gender = child.gender === 'boy' ? '男の子' : child.gender === 'girl' ? '女の子' : '未設定'
  out.push(`■ お子さん: ${child.name}(${gender}) 生年月日 ${child.birthday} / 生後${days}日(約${Math.floor(days / 30.4)}か月)`)

  out.push('\n■ 種類ごとの最新の記録')
  const seen = new Set<string>()
  for (const l of lastRs.results.sort((a, b) => b.started_at - a.started_at)) {
    if (seen.has(l.type)) continue
    seen.add(l.type)
    out.push('- ' + describeLog(l, fmt, who))
  }
  if (!seen.size) out.push('- (まだ記録がありません)')

  // 日別の集計(直近31日、ローカル日付)
  out.push('\n■ 日別のまとめ(新しい順。睡眠は日をまたぐ分を按分)')
  for (let i = 0; i < 31; i++) {
    const ds = todayStart - i * DAY
    const de = ds + DAY
    let feed = 0, breast = 0, ml = 0, sleepMs = 0, pee = 0, poop = 0, med = 0, bath = 0
    let maxTemp: number | null = null
    for (const l of logsRs.results) {
      if (l.type === 'sleep') {
        const a = Math.max(l.started_at, ds)
        const b = Math.min(l.ended_at ?? t, de)
        if (b > a) sleepMs += b - a
        continue
      }
      if (l.started_at < ds || l.started_at >= de) continue
      if (l.type === 'breast') { feed++; breast++ }
      else if (l.type === 'formula' || l.type === 'expressed') { feed++; ml += l.amount || 0 }
      else if (l.type === 'pee') pee++
      else if (l.type === 'poop') poop++
      else if (l.type === 'med') med++
      else if (l.type === 'bath') bath++
      else if (l.type === 'temp' && l.amount != null) maxTemp = Math.max(maxTemp ?? 0, l.amount)
    }
    const total = feed + pee + poop + med + bath + (maxTemp != null ? 1 : 0) + (sleepMs ? 1 : 0)
    const label = fmt(ds).split(' ')[0] + (i === 0 ? '[今日・途中]' : '')
    if (!total) { out.push(`- ${label}: 記録なし`); continue }
    const parts = [
      `授乳${feed}回(母乳${breast}回・ミルク等${Math.round(ml)}ml)`,
      `睡眠${Math.floor(sleepMs / 3600000)}時間${Math.round((sleepMs % 3600000) / 60000)}分`,
      `おしっこ${pee}回`, `うんち${poop}回`
    ]
    if (maxTemp != null) parts.push(`最高体温${maxTemp}℃`)
    if (med) parts.push(`薬${med}回`)
    if (bath) parts.push(`お風呂${bath}回`)
    out.push(`- ${label}: ${parts.join(' / ')}`)
  }

  out.push('\n■ 直近48時間の記録(古い順)')
  const recent = logsRs.results.filter((l) => l.started_at >= t - 2 * DAY || l.ended_at == null)
  if (!recent.length) out.push('- (記録なし)')
  for (const l of recent.slice(-300)) out.push('- ' + describeLog(l, fmt, who))

  out.push('\n■ 思い出日記(直近31日)')
  if (!diaryRs.results.length) out.push('- (なし)')
  for (const d of diaryRs.results) out.push(`- ${d.entry_date}: ${(d.body || '(写真のみ)').replace(/\s+/g, ' ').slice(0, 200)}`)

  out.push('\n■ 成長記録(新しい順)')
  if (!growthRs.results.length) out.push('- (なし)')
  for (const g of growthRs.results) {
    const v = [g.weight_g != null ? `体重${g.weight_g}g` : '', g.height_cm != null ? `身長${g.height_cm}cm` : '', g.head_cm != null ? `頭囲${g.head_cm}cm` : '']
    out.push(`- ${g.measured_on}: ${v.filter(Boolean).join(' / ')}`)
  }

  if (foodsRs.results.length) {
    out.push('\n■ 離乳食(直近31日)')
    const R: Record<string, string> = { ok: '問題なし', mild: '軽い症状', severe: '強い症状' }
    for (const f of foodsRs.results) out.push(`- ${f.tried_on}: ${f.food.slice(0, 40)}(${R[f.reaction] || f.reaction})`)
  }
  if (vacRs.results.length) {
    out.push('\n■ 予防接種(直近31日に接種済み)')
    for (const v of vacRs.results) out.push(`- ${v.done_on}: ${v.vaccine_key}`)
  }
  return out.join('\n')
}

type LogRow = { type: string; started_at: number; ended_at: number | null; amount: number | null; detail: string | null; note: string | null; member_id: string | null }

const LOG_LABEL: Record<string, string> = {
  breast: '母乳', formula: 'ミルク', expressed: '搾母乳', sleep: '睡眠', pee: 'おしっこ',
  poop: 'うんち', temp: '体温', bath: 'お風呂', med: '薬', memo: 'メモ'
}

function describeLog(l: LogRow, fmt: (ms: number) => string, who: Map<string, string>): string {
  let d: Record<string, unknown> = {}
  try { d = l.detail ? JSON.parse(l.detail) || {} : {} } catch { d = {} }
  let s = `${fmt(l.started_at)} ${LOG_LABEL[l.type] || l.type}`
  if (l.type === 'breast' || l.type === 'sleep') {
    if (l.ended_at == null) s += '(計測中)'
    else s += `(${Math.round((l.ended_at - l.started_at) / 60000)}分)`
  }
  if (l.type === 'breast' && typeof d.side === 'string') s += ` ${({ left: '左', right: '右', both: '両方' } as Record<string, string>)[d.side] || ''}`
  if ((l.type === 'formula' || l.type === 'expressed') && l.amount != null) s += ` ${l.amount}ml`
  if (l.type === 'temp' && l.amount != null) s += ` ${l.amount}℃`
  if (l.type === 'poop' && typeof d.kind === 'string') s += ` ${({ hard: 'かため', normal: 'ふつう', soft: 'やわらかめ', watery: '水っぽい' } as Record<string, string>)[d.kind] || ''}`
  if (l.type === 'med' && typeof d.name === 'string') s += ` ${d.name.slice(0, 60)}`
  if (l.note) s += ` メモ:「${l.note.replace(/\s+/g, ' ').slice(0, 120)}」`
  const by = l.member_id ? who.get(l.member_id) : null
  if (by) s += ` [記録:${by}]`
  return s
}

api.notFound((c) => c.json({ error: 'not found' }, 404))
api.onError((e, c) => {
  console.error(e)
  return c.json({ error: 'サーバーエラーが発生しました' }, 500)
})

export default api
