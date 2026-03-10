import { cookies } from "next/headers"

export type AuthRole = "admin" | "user"

export interface AuthSession {
  maTK: string
  tenTK: string
  emailTK: string
  role: AuthRole
  maGV: string
  tenGV: string
  emailGV: string
  khoa: string
}

const SESSION_COOKIE = "auth_session"

const toBase64Url = (value: string) => {
  if (typeof btoa === "function") {
    const encoded = btoa(unescape(encodeURIComponent(value)))
    return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
  }

  return Buffer.from(value, "utf8").toString("base64url")
}

const fromBase64Url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4)

  if (typeof atob === "function") {
    return decodeURIComponent(escape(atob(padded)))
  }

  return Buffer.from(value, "base64url").toString("utf8")
}

export const encodeSession = (session: AuthSession) => {
  const payload = JSON.stringify(session)
  return toBase64Url(payload)
}

export const decodeSession = (rawValue: string | undefined | null): AuthSession | null => {
  if (!rawValue) return null

  try {
    const json = fromBase64Url(rawValue)
    const parsed = JSON.parse(json)

    if (!parsed || typeof parsed !== "object") return null

    const role = String(parsed.role || "").toLowerCase()
    if (role !== "admin" && role !== "user") return null

    return {
      maTK: String(parsed.maTK || "").trim(),
      tenTK: String(parsed.tenTK || "").trim(),
      emailTK: String(parsed.emailTK || "").trim(),
      role,
      maGV: String(parsed.maGV || "").trim(),
      tenGV: String(parsed.tenGV || "").trim(),
      emailGV: String(parsed.emailGV || "").trim(),
      khoa: String(parsed.khoa || "").trim(),
    }
  } catch {
    return null
  }
}

export const getAuthSession = async () => {
  const cookieStore = await cookies()
  const raw = cookieStore.get(SESSION_COOKIE)?.value
  return decodeSession(raw)
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE
