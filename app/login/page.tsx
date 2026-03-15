"use client"

import { FormEvent, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

type LoginResponse = {
  success: boolean
  error?: string
}

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [forgotLoading, setForgotLoading] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [forgotMessage, setForgotMessage] = useState("")
  const [forgotError, setForgotError] = useState("")

  const redirectTarget = searchParams.get("redirect") || "/"

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return

    setError("")
    setLoading(true)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      const payload = (await response.json()) as LoginResponse
      if (!response.ok || !payload.success) {
        setError(payload.error || "Đăng nhập thất bại")
        return
      }

      router.replace(redirectTarget)
      router.refresh()
    } catch {
      setError("Không thể kết nối máy chủ")
    } finally {
      setLoading(false)
    }
  }

  const handleRequestCode = async () => {
    if (forgotLoading) return

    setForgotError("")
    setForgotMessage("")
    setForgotLoading(true)

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request-code", email: forgotEmail }),
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setForgotError(payload.error || "Không gửi được mã xác minh")
        return
      }

      setCodeSent(true)
      setForgotMessage(payload.message || "Đã gửi mã xác minh qua email")
    } catch {
      setForgotError("Không thể kết nối máy chủ")
    } finally {
      setForgotLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (forgotLoading) return
    if (!codeSent) return

    setForgotError("")
    setForgotMessage("")

    if (!verificationCode.trim()) {
      setForgotError("Vui lòng nhập mã xác minh")
      return
    }

    if (!newPassword) {
      setForgotError("Vui lòng nhập mật khẩu mới")
      return
    }

    if (newPassword !== confirmPassword) {
      setForgotError("Mật khẩu xác nhận không khớp")
      return
    }

    setForgotLoading(true)
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset-password",
          email: forgotEmail,
          code: verificationCode,
          newPassword,
        }),
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setForgotError(payload.error || "Không thể đổi mật khẩu")
        return
      }

      setForgotMessage(payload.message || "Đổi mật khẩu thành công")
      setVerificationCode("")
      setNewPassword("")
      setConfirmPassword("")
    } catch {
      setForgotError("Không thể kết nối máy chủ")
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-6"
      style={{
        backgroundImage: "url('https://anhdephd.vn/wp-content/uploads/2022/05/background-xanh-duong-nhat.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-primary/40" />

      <Card className="relative w-full max-w-md border-background/30 bg-background/95 shadow-xl backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mb-3 flex justify-center">
            <img
              src="https://png.pngtree.com/png-clipart/20230816/original/pngtree-education-book-icon-template-vector-symbol-creative-teaching-vector-picture-image_10908999.png"
              alt="Logo hệ thống"
              className="h-20 w-20 object-contain"
            />
          </div>
          <CardTitle className="text-2xl font-bold">Hệ thống quản lý lịch dạy</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5 text-center">
            <div className="space-y-2">
              <Label htmlFor="username" className="block text-center">Tài khoản hoặc email</Label>
              <Input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Nhập tên tài khoản"
                autoComplete="username"
                className="text-center"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="block text-center">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
                className="text-center"
                required
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </Button>

            <button
              type="button"
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => {
                setShowForgotPassword((prev) => !prev)
                setForgotError("")
                setForgotMessage("")
              }}
            >
              {showForgotPassword ? "Ẩn quên mật khẩu" : "Quên mật khẩu?"}
            </button>
          </form>

          {showForgotPassword ? (
            <div className="mt-6 space-y-4 rounded-md border p-4 text-center">
              <p className="text-sm font-semibold">Khôi phục mật khẩu</p>

              {!codeSent ? (
                <>
                  <div className="space-y-2 text-left">
                    <Label htmlFor="forgotEmail" className="block text-center">Email tài khoản</Label>
                    <Input
                      id="forgotEmail"
                      type="email"
                      value={forgotEmail}
                      onChange={(event) => setForgotEmail(event.target.value)}
                      placeholder="Nhập email đã đăng ký"
                      className="text-center"
                      required
                    />
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleRequestCode}
                    disabled={forgotLoading || !forgotEmail.trim()}
                  >
                    {forgotLoading ? "Đang gửi mã..." : "Gửi mã xác minh"}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Mã xác minh đã được gửi tới <span className="font-medium text-foreground">{forgotEmail}</span>
                  </p>

                  <div className="space-y-2 text-left">
                    <Label htmlFor="verificationCode" className="block text-center">Mã xác minh</Label>
                    <Input
                      id="verificationCode"
                      value={verificationCode}
                      onChange={(event) => setVerificationCode(event.target.value)}
                      placeholder="Nhập mã gồm 6 chữ số"
                      className="text-center"
                    />
                  </div>

                  <div className="space-y-2 text-left">
                    <Label htmlFor="newPassword" className="block text-center">Mật khẩu mới</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Tối thiểu 6 ký tự"
                      className="text-center"
                    />
                  </div>

                  <div className="space-y-2 text-left">
                    <Label htmlFor="confirmPassword" className="block text-center">Xác nhận mật khẩu mới</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Nhập lại mật khẩu mới"
                      className="text-center"
                    />
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleResetPassword}
                    disabled={forgotLoading}
                  >
                    {forgotLoading ? "Đang cập nhật..." : "Xác minh và đổi mật khẩu"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setCodeSent(false)
                      setVerificationCode("")
                      setNewPassword("")
                      setConfirmPassword("")
                      setForgotError("")
                      setForgotMessage("")
                    }}
                    disabled={forgotLoading}
                  >
                    Đổi email khác
                  </Button>
                </>
              )}

              {forgotError ? <p className="text-sm text-destructive">{forgotError}</p> : null}
              {forgotMessage ? <p className="text-sm text-emerald-600">{forgotMessage}</p> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
