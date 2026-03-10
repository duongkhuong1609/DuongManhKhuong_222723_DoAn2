"use client"

import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type UserOverviewData = {
  tenTK: string
  emailTK: string
  maGV: string
  tenGV: string
  khoa: string
  courses: Array<{
    maMon: string
    tenMon: string
    loaiMon: string
    soTinChi: number
    tenNganh: string
  }>
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const payload = await response.json()
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Không thể tải dữ liệu")
  }
  return payload.data as UserOverviewData
}

export function UserOverviewModule() {
  const { data, error, isLoading } = useSWR("/api/user/overview", fetcher)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải tổng quan cá nhân...</p>
  }

  if (error || !data) {
    return <p className="text-sm text-destructive">Không thể tải tổng quan cá nhân.</p>
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Giảng viên</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{data.tenGV || data.tenTK || "-"}</p>
            <p className="text-sm text-muted-foreground">{data.maGV || "Chưa liên kết mã giảng viên"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Khoa phụ trách</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{data.khoa || "-"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Số môn đảm nhiệm</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.courses.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Các môn giảng viên đang đảm nhiệm</CardTitle>
        </CardHeader>
        <CardContent>
          {data.courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu môn đảm nhiệm.</p>
          ) : (
            <div className="space-y-3">
              {data.courses.map((course) => (
                <div key={course.maMon} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{course.tenMon || "-"}</p>
                    <Badge variant="secondary">{course.maMon || "-"}</Badge>
                    {course.loaiMon ? <Badge variant="outline">{course.loaiMon}</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {course.tenNganh || "Chưa có ngành"} • {course.soTinChi || 0} tín chỉ
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
