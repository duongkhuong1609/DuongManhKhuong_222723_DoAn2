import nodemailer from "nodemailer"

interface CredentialEmailPayload {
  recipientEmail: string
  instructorName: string
  username: string
  password: string
  instructorEmail?: string
}

interface CredentialEmailResult {
  sent: boolean
  reason?: string
}

interface PasswordResetCodeEmailPayload {
  recipientEmail: string
  displayName: string
  verificationCode: string
  expiresMinutes: number
}

interface PasswordResetSuccessEmailPayload {
  recipientEmail: string
  displayName: string
}

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || process.env.CURRENT_ADMIN_EMAIL || "").trim()

const readEnv = () => ({
  host: String(process.env.SMTP_HOST || process.env.MAIL_HOST || "smtp.gmail.com").trim(),
  port: Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 587),
  user: String(
    process.env.SMTP_USER ||
    process.env.MAIL_USER ||
    process.env.MAIL_USERNAME ||
    process.env.EMAIL_USER ||
    process.env.EMAIL_USERNAME ||
    process.env.ADMIN_EMAIL ||
    process.env.CURRENT_ADMIN_EMAIL ||
    ADMIN_EMAIL
  ).trim(),
  pass: String(
    process.env.SMTP_PASS ||
    process.env.SMTP_PASSWORD ||
    process.env.MAIL_PASS ||
    process.env.MAIL_PASSWORD ||
    process.env.EMAIL_PASS ||
    process.env.EMAIL_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    process.env.CURRENT_ADMIN_PASSWORD ||
    ""
  ).trim(),
  from: String(
    process.env.SMTP_FROM ||
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    process.env.MAIL_USER ||
    process.env.EMAIL_FROM ||
    process.env.EMAIL_USER ||
    process.env.ADMIN_EMAIL ||
    process.env.CURRENT_ADMIN_EMAIL ||
    ADMIN_EMAIL
  ).trim(),
  secureFlag: String(process.env.SMTP_SECURE || process.env.MAIL_SECURE || "false").trim().toLowerCase(),
  rejectUnauthorized:
    String(process.env.SMTP_REJECT_UNAUTHORIZED || "true").trim().toLowerCase() === "true",
})

const canSendEmail = (env: ReturnType<typeof readEnv>) => {
  return Boolean(env.host && env.port > 0 && env.from && env.user && env.pass)
}

const resolveSecure = (env: ReturnType<typeof readEnv>) => {
  if (env.secureFlag === "true") return true
  if (env.secureFlag === "false") return false
  return env.port === 465
}

const isSelfSignedCertError = (error: any) => {
  const message = String(error?.message || "").toLowerCase()
  return (
    message.includes("self-signed certificate") ||
    message.includes("self signed certificate") ||
    message.includes("self-signed certificate in certificate chain") ||
    message.includes("unable to verify the first certificate") ||
    message.includes("unable to get local issuer certificate")
  )
}

const createSmtpTransporter = (env: ReturnType<typeof readEnv>, rejectUnauthorized: boolean) => {
  return nodemailer.createTransport({
    host: env.host,
    port: env.port,
    secure: resolveSecure(env),
    auth: env.user && env.pass
      ? {
          user: env.user,
          pass: env.pass,
        }
      : undefined,
    tls: { rejectUnauthorized },
  })
}

const sendMailWithSelfSignedRetry = async (
  env: ReturnType<typeof readEnv>,
  mailOptions: { from: string; to: string; subject: string; text: string },
) => {
  const sendWith = async (rejectUnauthorized: boolean) => {
    const transporter = createSmtpTransporter(env, rejectUnauthorized)

    try {
      await transporter.verify()
    } catch (verifyError) {
      console.warn("SMTP verify warning:", verifyError)
    }

    await transporter.sendMail(mailOptions)
  }

  try {
    await sendWith(env.rejectUnauthorized)
  } catch (sendError: any) {
    if (env.rejectUnauthorized && isSelfSignedCertError(sendError)) {
      console.warn("Retrying SMTP send with rejectUnauthorized=false due to certificate chain issue")
      try {
        await sendWith(false)
        return
      } catch (secondError: any) {
        if (!isSelfSignedCertError(secondError)) {
          throw secondError
        }

        // Last resort for legacy/self-signed SMTP stacks.
        const previousTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
        try {
          await sendWith(false)
          return
        } finally {
          if (previousTlsSetting === undefined) {
            delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
          } else {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsSetting
          }
        }
      }
    }
    throw sendError
  }
}

interface UpdateEmailPayload {
  recipientEmail: string
  instructorName: string
  position: string
  status: string
  department: string
}

export async function sendInstructorUpdateEmail(
  payload: UpdateEmailPayload,
): Promise<CredentialEmailResult> {
  const env = readEnv()

  if (!canSendEmail(env)) {
    return {
      sent: false,
      reason: "Thiếu cấu hình SMTP (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM)",
    }
  }

  try {
    const subject = "Thong bao cap nhat thong tin giang vien"
    const text = [
      `Xin chao ${payload.instructorName},`,
      "",
      "Thong tin tai khoan giang vien cua thay/co vua duoc cap nhat boi quan tri vien.",
      "",
      "Thong tin hien tai:",
      `  Ho va ten   : ${payload.instructorName}`,
      `  Chuc vu     : ${payload.position}`,
      `  Trang thai  : ${payload.status}`,
      `  Khoa/Bo mon : ${payload.department}`,
      "",
      "Neu co thac mac, vui long lien he phong dao tao.",
    ].join("\n")

    await sendMailWithSelfSignedRetry(env, {
      from: env.from,
      to: payload.recipientEmail,
      subject,
      text,
    })

    return { sent: true }
  } catch (error: any) {
    return {
      sent: false,
      reason: String(error?.message || "Khong gui duoc email"),
    }
  }
}

export async function sendInstructorCredentialEmail(
  payload: CredentialEmailPayload,
): Promise<CredentialEmailResult> {
  const env = readEnv()

  if (!canSendEmail(env)) {
    return {
      sent: false,
      reason: "Thiếu cấu hình SMTP (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM)",
    }
  }

  try {
    const subject = "Thong tin tai khoan he thong xep lich"
    const text = [
      `Xin chao ${payload.instructorName},`,
      "",
      "Thong tin tai khoan giang vien cua thay/co da duoc he thong tao:",
      `Email giang vien: ${payload.instructorEmail || payload.recipientEmail}`,
      `Ten dang nhap: ${payload.username}`,
      `Mat khau mac dinh: ${payload.password}`,
      "",
      "Yeu cau: vui long dang nhap va doi mat khau ngay sau lan dang nhap dau tien.",
    ].join("\n")

    await sendMailWithSelfSignedRetry(env, {
      from: env.from,
      to: payload.recipientEmail,
      subject,
      text,
    })

    return { sent: true }
  } catch (error: any) {
    return {
      sent: false,
      reason: String(error?.message || "Không gửi được email"),
    }
  }
}

export async function sendPasswordResetCodeEmail(
  payload: PasswordResetCodeEmailPayload,
): Promise<CredentialEmailResult> {
  const env = readEnv()

  if (!canSendEmail(env)) {
    return {
      sent: false,
      reason: "Thiếu cấu hình SMTP (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM)",
    }
  }

  try {
    const subject = "Ma xac minh dat lai mat khau"
    const text = [
      `Xin chao ${payload.displayName},`,
      "",
      "Ban vua yeu cau dat lai mat khau cho tai khoan he thong.",
      `Ma xac minh cua ban la: ${payload.verificationCode}`,
      `Ma co hieu luc trong ${payload.expiresMinutes} phut.`,
      "",
      "Neu ban khong thuc hien yeu cau nay, vui long bo qua email nay.",
    ].join("\n")

    await sendMailWithSelfSignedRetry(env, {
      from: env.from,
      to: payload.recipientEmail,
      subject,
      text,
    })

    return { sent: true }
  } catch (error: any) {
    return {
      sent: false,
      reason: String(error?.message || "Khong gui duoc email xac minh"),
    }
  }
}

export async function sendPasswordResetSuccessEmail(
  payload: PasswordResetSuccessEmailPayload,
): Promise<CredentialEmailResult> {
  const env = readEnv()

  if (!canSendEmail(env)) {
    return {
      sent: false,
      reason: "Thiếu cấu hình SMTP (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM)",
    }
  }

  try {
    const subject = "Thong bao doi mat khau thanh cong"
    const text = [
      `Xin chao ${payload.displayName},`,
      "",
      "Mat khau tai khoan he thong cua ban da duoc doi thanh cong.",
      "Neu ban khong thuc hien thao tac nay, vui long lien he quan tri vien ngay.",
    ].join("\n")

    await sendMailWithSelfSignedRetry(env, {
      from: env.from,
      to: payload.recipientEmail,
      subject,
      text,
    })

    return { sent: true }
  } catch (error: any) {
    return {
      sent: false,
      reason: String(error?.message || "Khong gui duoc email thong bao"),
    }
  }
}
