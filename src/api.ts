import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { parseCare, GeminiError, type GeminiEnv } from './gemini'

export type Bindings = { DB: D1Database; PHOTOS: R2Bucket } & GeminiEnv
type Vars = { familyId: string; memberId: string }
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

const api = new Hono<Env>()

// ---------- 認証不要: 家族の作成・参加 ----------

async function uniqueCode(db: D1Database): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = randomCode()
    const exists = await db.prepare('SELECT 1 FROM families WHERE code = ?').bind(code).first()
    if (!exists) return code
  }
  return ''
}

api.post('/families', async (c) => {
  const body = await readJson(c)
  const memberName = str(body.memberName, 30)
  if (!memberName) return c.json({ error: 'あなたの呼び名を入力してください' }, 400)

  const db = c.env.DB
  const familyId = uuid()
  const code = await uniqueCode(db)
  if (!code) return c.json({ error: '家族コードの生成に失敗しました。もう一度お試しください' }, 500)

  const token = randomToken()
  const memberId = uuid()
  const t = now()
  await db.batch([
    db.prepare('INSERT INTO families (id, code, created_at) VALUES (?, ?, ?)').bind(familyId, code, t),
    db.prepare('INSERT INTO members (id, family_id, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(memberId, familyId, memberName, await sha256(token), t)
  ])
  return c.json({ token, code, memberId })
})

api.post('/join', async (c) => {
  const body = await readJson(c)
  const memberName = str(body.memberName, 30)
  const code = str(body.code, 20)?.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!memberName) return c.json({ error: 'あなたの呼び名を入力してください' }, 400)
  if (!code) return c.json({ error: '家族コードを入力してください' }, 400)

  const db = c.env.DB
  const family = await db.prepare('SELECT id FROM families WHERE code = ?').bind(code).first<{ id: string }>()
  if (!family) return c.json({ error: '家族コードが見つかりません。入力を確認してください' }, 404)

  const token = randomToken()
  const memberId = uuid()
  await db
    .prepare('INSERT INTO members (id, family_id, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(memberId, family.id, memberName, await sha256(token), now())
    .run()
  return c.json({ token, code, memberId })
})

// ---------- 認証 ----------

api.use('*', async (c: Context<Env>, next: Next) => {
  const path = c.req.path
  if (path.endsWith('/families') || path.endsWith('/join')) return next()
  const auth = c.req.header('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return c.json({ error: 'unauthorized' }, 401)
  const m = await c.env.DB
    .prepare('SELECT id, family_id FROM members WHERE token_hash = ?')
    .bind(await sha256(token))
    .first<{ id: string; family_id: string }>()
  if (!m) return c.json({ error: 'unauthorized' }, 401)
  c.set('familyId', m.family_id)
  c.set('memberId', m.id)
  return next()
})

// 自分・家族・メンバー・子どもをまとめて返す
api.get('/me', async (c) => {
  const db = c.env.DB
  const familyId = c.get('familyId')
  const [family, members, children] = await Promise.all([
    db.prepare('SELECT id, code FROM families WHERE id = ?').bind(familyId).first(),
    db.prepare('SELECT id, name FROM members WHERE family_id = ? ORDER BY created_at').bind(familyId).all(),
    db.prepare('SELECT id, name, birthday, gender FROM children WHERE family_id = ? ORDER BY birthday, created_at')
      .bind(familyId).all()
  ])
  return c.json({
    me: c.get('memberId'),
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

// 家族コードの再発行。古いコードは使えなくなる(参加済みの端末はそのまま使える)
api.post('/families/regenerate-code', async (c) => {
  const code = await uniqueCode(c.env.DB)
  if (!code) return c.json({ error: '家族コードの生成に失敗しました。もう一度お試しください' }, 500)
  await c.env.DB.prepare('UPDATE families SET code = ? WHERE id = ?').bind(code, c.get('familyId')).run()
  return c.json({ code })
})

// メンバーの削除(自分自身は不可)。削除された端末は以後アクセスできない
api.delete('/members/:id', async (c) => {
  const id = c.req.param('id')
  if (id === c.get('memberId')) return c.json({ error: '自分自身は削除できません。「連携を解除」を使ってください' }, 400)
  const r = await c.env.DB
    .prepare('DELETE FROM members WHERE id = ? AND family_id = ?')
    .bind(id, c.get('familyId'))
    .run()
  if (!r.meta.changes) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})

// ---------- 子ども ----------

api.post('/children', async (c) => {
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
    db.prepare('DELETE FROM diary WHERE child_id = ? AND family_id = ?').bind(id, fid),
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
  const childId = c.req.param('id')
  if (!(await ownsChild(c, childId))) return c.json({ error: 'not found' }, 404)
  await c.env.DB
    .prepare('DELETE FROM vaccinations WHERE child_id = ? AND family_id = ? AND vaccine_key = ?')
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
      `SELECT id, member_id, entry_date, body, photo_id FROM diary
       WHERE child_id = ? AND family_id = ? ORDER BY entry_date DESC, created_at DESC LIMIT ?`
    )
    .bind(childId, c.get('familyId'), limit)
    .all()
  return c.json({ diary: rs.results })
})

api.post('/children/:id/diary', async (c) => {
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
  const row = await c.env.DB
    .prepare('SELECT photo_id FROM diary WHERE id = ? AND family_id = ?')
    .bind(c.req.param('id'), c.get('familyId'))
    .first<{ photo_id: string | null }>()
  if (!row) return c.json({ error: 'not found' }, 404)
  await c.env.DB.prepare('DELETE FROM diary WHERE id = ? AND family_id = ?').bind(c.req.param('id'), c.get('familyId')).run()
  if (row.photo_id) await c.env.PHOTOS.delete(`${c.get('familyId')}/${row.photo_id}`)
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
  const row = await c.env.DB
    .prepare(
      `INSERT INTO ai_usage (family_id, day, count) VALUES (?, ?, 1)
       ON CONFLICT(family_id, day) DO UPDATE SET count = count + 1 RETURNING count`
    )
    .bind(familyId, jstDay())
    .first<{ count: number }>()
  const refund = () =>
    c.env.DB.prepare('UPDATE ai_usage SET count = MAX(count - 1, 0) WHERE family_id = ? AND day = ?').bind(familyId, jstDay()).run()
  if ((row?.count ?? 1) > AI_DAILY_LIMIT) {
    await refund()
    return c.json({ error: `AI入力は1日${AI_DAILY_LIMIT}回までです。明日またお使いください(手入力は何度でもできます)` }, 429)
  }

  try {
    const result = await parseCare(c.env, input, localNowText(tz))
    return c.json({ ...result, remaining: Math.max(0, AI_DAILY_LIMIT - (row?.count ?? 1)) })
  } catch (e) {
    await refund()
    if (e instanceof GeminiError) return c.json({ error: e.userMessage }, e.status as 502 | 503 | 504)
    throw e
  }
})

api.notFound((c) => c.json({ error: 'not found' }, 404))
api.onError((e, c) => {
  console.error(e)
  return c.json({ error: 'サーバーエラーが発生しました' }, 500)
})

export default api
