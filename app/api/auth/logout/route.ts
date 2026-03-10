import { NextResponse } from "next/server"
import { SESSION_COOKIE_NAME } from "@/lib/auth-session"

export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0,
  })
  return response
}
