"use client"

import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

type ProfileData = {
  maTK: string
  tenTK: string
  emailTK: string
  quyen: string
  maGV: string
  tenGV: string
  emailGV: string
  chucVu: string
  trangThai: string
  khoa: string
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const payload = await response.json()
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Không thể tải dữ liệu")
  }
  return payload.data as ProfileData
}

export function UserProfileModule() {
  const { data, error, isLoading } = useSWR("/api/user/profile", fetcher)

  const avatarInitial = String(data?.tenTK || "").trim().charAt(0).toUpperCase() || "?"

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải thông tin cá nhân...</p>
  }

  if (error || !data) {
    return <p className="text-sm text-destructive">Không thể tải thông tin cá nhân.</p>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="text-lg font-semibold">{avatarInitial}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <p className="text-xl font-semibold leading-none">{data.tenTK || "-"}</p>
              <p className="text-sm text-muted-foreground">{data.emailTK || "-"}</p>
            </div>
          </div>
          <Badge variant="secondary" className="w-fit">
            {data.quyen ? data.quyen.toUpperCase() : "-"}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin cá nhân</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Mã tài khoản</p>
            <p className="mt-1 font-medium">{data.maTK || "-"}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Mã giảng viên</p>
            <p className="mt-1 font-medium">{data.maGV || "-"}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Tên giảng viên</p>
            <p className="mt-1 font-medium">{data.tenGV || "-"}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Email giảng viên</p>
            <p className="mt-1 font-medium">{data.emailGV || "-"}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Chức vụ</p>
            <p className="mt-1 font-medium">{data.chucVu || "-"}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Trạng thái</p>
            <p className="mt-1 font-medium">{data.trangThai || "-"}</p>
          </div>
          <div className="rounded-lg border p-4 md:col-span-2">
            <p className="text-xs text-muted-foreground">Khoa</p>
            <p className="mt-1 font-medium">{data.khoa || "-"}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
