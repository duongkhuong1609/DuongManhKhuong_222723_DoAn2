"use client"

import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type TeachingRow = {
  maLD: string
  ngayDay: string
  soTietDay: number
  trangThai: string
  hocKyDay: string
  buoi: string
  tenLop: string
  tenMon: string
  tenPhong: string
}

type TeachingData = {
  schedules: TeachingRow[]
  summary: {
    totalRows: number
    totalPeriods: number
  }
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const payload = await response.json()
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Không thể tải dữ liệu")
  }
  return payload.data as TeachingData
}

const formatDate = (value: string) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("vi-VN")
}

export function UserTeachingModule() {
  const { data, error, isLoading } = useSWR("/api/user/teaching", fetcher)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải lịch dạy cá nhân...</p>
  }

  if (error || !data) {
    return <p className="text-sm text-destructive">Không thể tải lịch dạy cá nhân.</p>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Giờ dạy và lịch dạy cá nhân</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Số lịch dạy</p>
            <p className="text-2xl font-semibold">{data.summary.totalRows}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Tổng số tiết</p>
            <p className="text-2xl font-semibold">{data.summary.totalPeriods}</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">Ngày dạy</th>
                <th className="px-3 py-2 text-left">Môn</th>
                <th className="px-3 py-2 text-left">Lớp</th>
                <th className="px-3 py-2 text-left">Phòng</th>
                <th className="px-3 py-2 text-left">Buổi</th>
                <th className="px-3 py-2 text-left">Số tiết</th>
                <th className="px-3 py-2 text-left">Học kỳ</th>
                <th className="px-3 py-2 text-left">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {data.schedules.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">
                    Chưa có dữ liệu lịch dạy.
                  </td>
                </tr>
              ) : (
                data.schedules.map((row) => (
                  <tr key={row.maLD} className="border-t">
                    <td className="px-3 py-2">{formatDate(row.ngayDay)}</td>
                    <td className="px-3 py-2">{row.tenMon || "-"}</td>
                    <td className="px-3 py-2">{row.tenLop || "-"}</td>
                    <td className="px-3 py-2">{row.tenPhong || "-"}</td>
                    <td className="px-3 py-2">{row.buoi || "-"}</td>
                    <td className="px-3 py-2">{row.soTietDay || 0}</td>
                    <td className="px-3 py-2">{row.hocKyDay || "-"}</td>
                    <td className="px-3 py-2">{row.trangThai || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
