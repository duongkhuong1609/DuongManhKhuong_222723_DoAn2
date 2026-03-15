"use client"

import { useEffect, useMemo, useState } from "react"
import { BookOpen, CalendarRange, DoorOpen, ListChecks, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type OverviewPayload = {
  filters: {
    years: number[]
    selectedYear: number
    semesters: Array<{ id: string; name: string; label: string }>
    selectedSemesterId: string
    selectedSemesterName: string
    academicYearLabel: string
  }
  overview: {
    activeInstructors: number
    totalCourses: number
    activeClasses: number
    availableRooms: number
    totalSchedules: number
  }
  recentSchedules: Array<{
    id: string
    date: string
    weekday: string
    session: string
    courseName: string
    instructorName: string
    roomName: string
    className: string
  }>
}

export function DashboardOverview() {
  const [selectedYear, setSelectedYear] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [overview, setOverview] = useState<OverviewPayload | null>(null)

  useEffect(() => {
    const loadOverview = async () => {
      try {
        setLoading(true)
        setError("")

        const params = new URLSearchParams()
        if (selectedYear) params.set("year", selectedYear)

        const res = await fetch(`/api/overview?${params.toString()}`, { cache: "no-store" })
        const json = await res.json()

        if (!res.ok || !json.success) {
          throw new Error(json.error || "Không thể tải dữ liệu tổng quan")
        }

        const data = json.data as OverviewPayload
        setOverview(data)

        const backendYear = String(data.filters?.selectedYear || "")
        if (backendYear && backendYear !== selectedYear) {
          setSelectedYear(backendYear)
        }
      } catch (err: any) {
        setOverview(null)
        setError(String(err?.message || "Lỗi khi tải dữ liệu tổng quan"))
      } finally {
        setLoading(false)
      }
    }

    loadOverview()
  }, [selectedYear])

  const quickStats = useMemo(() => {
    if (!overview) return []
    return [
      {
        title: "Giảng viên có thể dạy",
        value: overview.overview.activeInstructors,
        note: "Trạng thái hoạt động",
        icon: Users,
        iconClass: "bg-blue-100 text-blue-700",
      },
      {
        title: "Môn học",
        value: overview.overview.totalCourses,
        note: "Tổng số môn trong hệ thống",
        icon: BookOpen,
        iconClass: "bg-emerald-100 text-emerald-700",
      },
      {
        title: "Lớp chưa tốt nghiệp",
        value: overview.overview.activeClasses,
        note: "Lớp đang học từ năm 1-4",
        icon: CalendarRange,
        iconClass: "bg-amber-100 text-amber-700",
      },
      {
        title: "Phòng học khả dụng",
        value: overview.overview.availableRooms,
        note: "Phòng không khóa/bảo trì",
        icon: DoorOpen,
        iconClass: "bg-violet-100 text-violet-700",
      },
      {
        title: "Tổng lịch dạy năm nay",
        value: overview.overview.totalSchedules,
        note: "Theo năm học đang chọn",
        icon: ListChecks,
        iconClass: "bg-rose-100 text-rose-700",
      },
    ]
  }, [overview])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Hệ thống lập lịch tự động</h2>
          <p className="text-muted-foreground">
            Năm học: <span className="font-medium text-foreground">{overview?.filters.academicYearLabel || "-"}</span> • Học kỳ: <span className="font-medium text-foreground">{overview?.filters.selectedSemesterName || "-"}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Chọn năm" />
            </SelectTrigger>
            <SelectContent>
              {(overview?.filters.years || []).map((year) => (
                <SelectItem key={year} value={String(year)}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Đang tải dữ liệu tổng quan...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {quickStats.map((stat) => (
          <Card key={stat.title} className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`rounded-lg p-2 ${stat.iconClass}`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value.toLocaleString("vi-VN")}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.note}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-foreground">Lịch dạy được tạo gần đây</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thứ</TableHead>
                <TableHead>Ngày</TableHead>
                <TableHead>Tiết học</TableHead>
                <TableHead>Môn học</TableHead>
                <TableHead>Giảng viên</TableHead>
                <TableHead>Phòng học</TableHead>
                <TableHead>Lớp học</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(overview?.recentSchedules || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Chưa có dữ liệu lịch dạy trong bộ lọc đã chọn.
                  </TableCell>
                </TableRow>
              ) : (
                (overview?.recentSchedules || []).map((item) => (
                  <TableRow key={`${item.id}-${item.date}`}>
                    <TableCell>{item.weekday || "-"}</TableCell>
                    <TableCell>{item.date || "-"}</TableCell>
                    <TableCell>{item.session || "-"}</TableCell>
                    <TableCell>{item.courseName || "-"}</TableCell>
                    <TableCell>{item.instructorName || "-"}</TableCell>
                    <TableCell>{item.roomName || "-"}</TableCell>
                    <TableCell>{item.className || "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
