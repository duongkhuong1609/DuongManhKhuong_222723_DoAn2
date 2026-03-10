import { NextRequest, NextResponse } from "next/server"
import { decodeSession, SESSION_COOKIE_NAME } from "@/lib/auth-session"

const isPublicPath = (pathname: string) => {
  if (pathname === "/login") return true
  if (pathname.startsWith("/_next")) return true
  if (pathname.startsWith("/favicon")) return true
  if (pathname.startsWith("/public")) return true
  return false
}

const isPublicApiPath = (pathname: string) => {
  return pathname.startsWith("/api/auth/login") || pathname.startsWith("/api/auth/logout")
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = decodeSession(rawSession)

  if (pathname === "/login") {
    if (session) {
      const homeUrl = request.nextUrl.clone()
      homeUrl.pathname = "/"
      return NextResponse.redirect(homeUrl)
    }
    return NextResponse.next()
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  if (pathname.startsWith("/api")) {
    if (isPublicApiPath(pathname)) return NextResponse.next()

    if (!session) {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 })
    }

    if (session.role === "user" && !pathname.startsWith("/api/user") && !pathname.startsWith("/api/auth/me")) {
      return NextResponse.json({ success: false, error: "Không có quyền truy cập" }, { status: 403 })
    }

    return NextResponse.next()
  }

  if (!session) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
