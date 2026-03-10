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
          <CardTitle className="text-2xl">Đăng nhập hệ thống</CardTitle>
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
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
