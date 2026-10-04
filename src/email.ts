export interface EmailBindings {
  EMAIL?: {
    send(message: unknown): Promise<void>
  }
  EMAIL_FROM?: string
}

function encodeSubject(subject: string): string {
  const bytes = new TextEncoder().encode(subject)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const b64 = btoa(binary)
  return `=?utf-8?B?${b64}?=`
}

function buildRawEmail(from: string, fromName: string, to: string, subject: string, body: string): string {
  const encSubject = encodeSubject(subject)
  const encFromName = encodeSubject(fromName)
  return [
    `From: ${encFromName} <${from}>`,
    `To: <${to}>`,
    `Subject: ${encSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    body
  ].join('\r\n')
}

export async function sendVerificationEmail(env: EmailBindings, to: string, code: string): Promise<boolean> {
  const from = env.EMAIL_FROM || 'noreply@sukusuku-log.pages.dev'
  const fromName = 'すくすくログ'
  const subject = `【すくすくログ】認証コード: ${code}`
  const body = [
    `すくすくログをご利用いただきありがとうございます。`,
    ``,
    `新しく家族を作成するための認証コードは以下です:`,
    ``,
    `----------------------------------------`,
    `  認証コード: ${code}`,
    `----------------------------------------`,
    ``,
    `※有効期限は10分間です。`,
    `※心当たりがない場合は、このメールを破棄してください。`,
    ``,
    `---`,
    `すくすくログ`
  ].join('\n')

  if (env.EMAIL && typeof env.EMAIL.send === 'function') {
    try {
      // @ts-ignore
      const { EmailMessage } = await import('cloudflare:email')
      const raw = buildRawEmail(from, fromName, to, subject, body)
      const msg = new EmailMessage(from, to, raw)
      await env.EMAIL.send(msg)
      return true
    } catch (e) {
      console.error('Failed to send email via Cloudflare Email Routing:', e)
      throw new Error('認証メールの送信に失敗しました。メールアドレスをご確認ください')
    }
  }

  // ローカル開発や未設定時: コンソールに出力
  console.log(`[DEV/LOCAL EMAIL] To: ${to} | Verification Code: ${code}`)
  return true
}
