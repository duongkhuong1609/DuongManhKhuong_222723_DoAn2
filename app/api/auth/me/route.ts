import { NextResponse } from "next/server"
import { getAuthSession } from "@/lib/auth-session"

export async function GET() {
  const session = await getAuthSession()
  if (!session) {
    return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 })
  }

  return NextResponse.json({ success: true, data: session })
}
