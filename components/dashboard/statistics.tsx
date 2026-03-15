"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  Pie,
  PieChart,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type StatisticsResponse = {
  filters: {
    academicYearStart: number
    selectableYears: number[]
    selectedYear: number
  }
  overview: {
    totalSchedules: number
    totalPeriods: number
    totalInstructors: number
    totalRooms: number
    totalClasses: number
    totalMajors: number
    classConflicts: number
    roomConflicts: number
    teachingConflicts: number
    subjectConflicts: number
    totalConflicts: number
    preferenceFulfillmentRate: number
  }
  teacherLoad: Array<{
    id: string
    name: string
    periods: number
    sessions: number
    overload: boolean
  }>
  roomUsage: Array<{
    id: string
    name: string
    usedSessions: number
    usageRate: number
  }>
  unusedRooms: Array<{
    id: string
    name: string
  }>
  dailySchedules: Array<{
    day: string
    count: number
  }>
  byMajor: Array<{
    majorName: string
    schedules: number
  }>
  conflictDetails: {
    class: ConflictGroup[]
    room: ConflictGroup[]
    teaching: ConflictGroup[]
    subject: ConflictGroup[]
  }
}

type ConflictScheduleBrief = {
  id: string
  className: string
  courseName: string
  instructorName: string
  roomName: string
  date: string
  session: string
  status: string
}

type ConflictGroup = {
  key: string
  date: string
  session: string
  schedules: ConflictScheduleBrief[]
}

type ConflictType = "class" | "teaching" | "room" | "subject"

type RescheduleOptionPayload = {
  schedule: {
    id: string
    className: string
    courseName: string
    instructorName: string
    oldDate: string
    session: string
    periods: number
    semesterStart?: string
    semesterEnd: string
  }
  availableSlots?: Array<{ value: string; date: string; session: string; label: string }>
  availableDates: Array<{ value: string; label: string }>
}

const conflictTypeLabel: Record<ConflictType, string> = {
  class: "Trùng lớp",
  teaching: "Trùng lịch dạy",
  room: "Trùng phòng",
  subject: "Trùng môn",
}

const isPausedStatus = (value: string) => {
  const normalized = String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  return normalized.includes("tam ngung") || normalized.includes("tam dung") || normalized.includes("paused")
}

const PIE_COLORS = ["#4f6bed", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#84cc16"]
const BAR_COLORS = ["#2563eb", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b"]

export function StatisticsModule() {
  const [selectedYear, setSelectedYear] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [stats, setStats] = useState<StatisticsResponse | null>(null)
  const [openConflictDialog, setOpenConflictDialog] = useState(false)
  const [selectedConflictType, setSelectedConflictType] = useState<ConflictType>("class")
  const [openRescheduleDialog, setOpenRescheduleDialog] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState<ConflictScheduleBrief | null>(null)
  const [rescheduleOptions, setRescheduleOptions] = useState<RescheduleOptionPayload | null>(null)
  const [rescheduleSlot, setRescheduleSlot] = useState("")
  const [rescheduleLoading, setRescheduleLoading] = useState(false)
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false)
  const [rescheduleError, setRescheduleError] = useState("")
  const [rescheduleMessage, setRescheduleMessage] = useState("")
  const [bulkResolving, setBulkResolving] = useState(false)
  const [bulkResolveMessage, setBulkResolveMessage] = useState("")

  const reloadStatistics = useCallback(async () => {
    try {
      setLoading(true)
      setError("")

      const params = new URLSearchParams()
      if (selectedYear) params.set("year", selectedYear)

      const res = await fetch(`/api/statistics?${params.toString()}`, { cache: "no-store" })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Không thể tải dữ liệu thống kê")
      }

      const data = json.data as StatisticsResponse
      setStats(data)

      const backendYear = String(data.filters?.selectedYear || "")
      if (backendYear && backendYear !== selectedYear) {
        setSelectedYear(backendYear)
      }
    } catch (err: any) {
      setStats(null)
      setError(String(err?.message || "Lỗi khi tải dữ liệu thống kê"))
    } finally {
      setLoading(false)
    }
  }, [selectedYear])

  useEffect(() => {
    reloadStatistics()
  }, [reloadStatistics])

  const teacherLoadChart = useMemo(() => (stats?.teacherLoad || []).slice(0, 10), [stats])
  const roomUsageChart = useMemo(() => (stats?.roomUsage || []).slice(0, 10), [stats])
  const majorPieData = useMemo(
    () => (stats?.byMajor || []).map((item, index) => ({ ...item, color: PIE_COLORS[index % PIE_COLORS.length] })),
    [stats],
  )

  const highestLoadTeacher = teacherLoadChart[0]
  const lowestLoadTeacher = teacherLoadChart.length > 0 ? teacherLoadChart[teacherLoadChart.length - 1] : null
  const overloadedCount = (stats?.teacherLoad || []).filter((item) => item.overload).length

  const overview = stats?.overview
  const selectedConflictGroups = stats?.conflictDetails?.[selectedConflictType] || []

  const openConflictDetails = (type: ConflictType) => {
    setSelectedConflictType(type)
    setOpenConflictDialog(true)
    setBulkResolveMessage("")
  }

  const collectAllConflictSchedules = () => {
    const allGroups: ConflictGroup[] = [
      ...(stats?.conflictDetails.class || []),
      ...(stats?.conflictDetails.teaching || []),
      ...(stats?.conflictDetails.room || []),
      ...(stats?.conflictDetails.subject || []),
    ]

    const uniqueById = new Map<string, ConflictScheduleBrief>()
    for (const group of allGroups) {
      for (const item of group.schedules || []) {
        const id = String(item.id || "").trim()
        if (!id) continue
        if (isPausedStatus(item.status)) continue
        if (!uniqueById.has(id)) {
          uniqueById.set(id, item)
        }
      }
    }

    return Array.from(uniqueById.values())
  }

  const resolveConflictSchedule = async (scheduleId: string) => {
    const params = new URLSearchParams({
      mode: "reschedule-options",
      scheduleId: String(scheduleId),
    })
    const optionResponse = await fetch(`/api/schedules/timetable?${params.toString()}`, { cache: "no-store" })
    const optionPayload = await optionResponse.json()

    if (!optionResponse.ok || !optionPayload.success) {
      throw new Error(optionPayload.error || "Không thể tải tùy chọn dời lịch")
    }

    const options = optionPayload.data as RescheduleOptionPayload
    const targetSlot = options.availableSlots?.[0]?.value
    if (!targetSlot) {
      throw new Error("Không còn ngày hợp lệ để dời lịch")
    }

    const [targetDate, targetSession] = targetSlot.split("|")
    if (!targetDate || !targetSession) {
      throw new Error("Không xác định được buổi dời lịch hợp lệ")
    }

    const rescheduleResponse = await fetch("/api/schedules/timetable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reschedule",
        scheduleId: Number(scheduleId),
        newDate: targetDate,
        newSession: targetSession,
      }),
    })
    const reschedulePayload = await rescheduleResponse.json()
    if (!rescheduleResponse.ok || !reschedulePayload.success) {
      throw new Error(reschedulePayload.error || "Không thể điều chỉnh lịch dạy")
    }
  }

  const resolveAllConflicts = async () => {
    if (bulkResolving) return

    const schedules = collectAllConflictSchedules()
    if (schedules.length === 0) {
      setBulkResolveMessage("Không có lịch xung đột cần xử lý tự động.")
      return
    }

    setBulkResolving(true)
    setBulkResolveMessage("")

    let successCount = 0
    let failCount = 0
    const failSamples: string[] = []

    for (const schedule of schedules) {
      try {
        await resolveConflictSchedule(schedule.id)
        successCount += 1
      } catch (err: any) {
        failCount += 1
        if (failSamples.length < 5) {
          failSamples.push(`#${schedule.id}: ${String(err?.message || "Lỗi không xác định")}`)
        }
      }
    }

    const summary = [`Đã xử lý ${successCount}/${schedules.length} lịch xung đột.`]
    if (failCount > 0) {
      summary.push(`Thất bại ${failCount} lịch.`)
      if (failSamples.length > 0) {
        summary.push(`Chi tiết: ${failSamples.join(" | ")}`)
      }
    }
    setBulkResolveMessage(summary.join(" "))
    await reloadStatistics()
    setBulkResolving(false)
  }

  const openReschedule = async (item: ConflictScheduleBrief) => {
    if (!item?.id || isPausedStatus(item.status)) return

    setOpenRescheduleDialog(true)
    setRescheduleTarget(item)
    setRescheduleOptions(null)
    setRescheduleSlot("")
    setRescheduleError("")
    setRescheduleMessage("")
    setRescheduleLoading(true)

    try {
      const params = new URLSearchParams({
        mode: "reschedule-options",
        scheduleId: String(item.id),
      })
      const response = await fetch(`/api/schedules/timetable?${params.toString()}`, { cache: "no-store" })
      const payload = await response.json()

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Không thể tải tùy chọn dời lịch")
      }

      const data = payload.data as RescheduleOptionPayload
      setRescheduleOptions(data)
      if (data.availableSlots && data.availableSlots.length > 0) {
        setRescheduleSlot(data.availableSlots[0].value)
      } else if (data.availableDates.length > 0) {
        setRescheduleSlot(`${data.availableDates[0].value}|${data.schedule.session}`)
      }
    } catch (err: any) {
      setRescheduleError(String(err?.message || "Lỗi khi tải tùy chọn dời lịch"))
    } finally {
      setRescheduleLoading(false)
    }
  }

  const submitReschedule = async () => {
    if (!rescheduleTarget?.id) {
      setRescheduleError("Không xác định được lịch cần điều chỉnh")
      return
    }
    if (!rescheduleSlot) {
      setRescheduleError("Vui lòng chọn ngày và buổi mới")
      return
    }

    const [newDate, newSession] = String(rescheduleSlot).split("|")
    if (!newDate || !newSession) {
      setRescheduleError("Tùy chọn dời lịch không hợp lệ")
      return
    }

    setRescheduleSubmitting(true)
    setRescheduleError("")
    setRescheduleMessage("")

    try {
      const response = await fetch("/api/schedules/timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          scheduleId: Number(rescheduleTarget.id),
          newDate,
          newSession,
        }),
      })
      const payload = await response.json()

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Không thể điều chỉnh lịch dạy")
      }

      setRescheduleMessage("Điều chỉnh lịch thành công. Lịch cũ đã chuyển sang trạng thái Tạm ngưng.")
      await reloadStatistics()
    } catch (err: any) {
      setRescheduleError(String(err?.message || "Lỗi khi điều chỉnh lịch dạy"))
    } finally {
      setRescheduleSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Thống kê giờ dạy</h2>
          <p className="text-muted-foreground">
            Thống kê tổng quan, tải giảng dạy, sử dụng phòng, lịch theo ngày, ngành, xung đột và nguyện vọng giảng viên
          </p>
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Chọn năm thống kê" />
          </SelectTrigger>
          <SelectContent>
            {(stats?.filters?.selectableYears || []).map((year) => (
              <SelectItem key={year} value={String(year)}>{year}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Đang tải dữ liệu thống kê...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {overview && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-blue-200/70 bg-gradient-to-br from-blue-50 via-cyan-50 to-sky-100">
            <CardHeader className="pb-2">
              <CardDescription>1. Tổng quan hệ thống</CardDescription>
              <CardTitle className="text-lg">Tổng lịch năm {stats?.filters.selectedYear}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>Tổng lịch dạy: <span className="font-semibold text-foreground">{overview.totalSchedules}</span></p>
              <p>Tổng số tiết: <span className="font-semibold text-foreground">{overview.totalPeriods}</span></p>
              <p>Giảng viên: <span className="font-semibold text-foreground">{overview.totalInstructors}</span></p>
              <p>Lớp học: <span className="font-semibold text-foreground">{overview.totalClasses}</span></p>
            </CardContent>
          </Card>

          <Card className="border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-teal-50 to-lime-100">
            <CardHeader className="pb-2">
              <CardDescription>3. Sử dụng phòng học</CardDescription>
              <CardTitle className="text-lg">Hiệu suất phòng</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>Tổng phòng: <span className="font-semibold text-foreground">{overview.totalRooms}</span></p>
              <p>Phòng có lịch: <span className="font-semibold text-foreground">{Math.max(0, overview.totalRooms - (stats?.unusedRooms.length || 0))}</span></p>
              <p>Phòng bỏ trống: <span className="font-semibold text-foreground">{stats?.unusedRooms.length || 0}</span></p>
            </CardContent>
          </Card>

          <Card className="border-rose-200/70 bg-gradient-to-br from-rose-50 via-orange-50 to-amber-100">
            <CardHeader className="pb-2">
              <CardDescription>Thống kê xung đột lịch</CardDescription>
              <CardTitle className="text-lg">Mức độ xung đột</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>Tổng xung đột: <span className="font-semibold text-foreground">{overview.totalConflicts}</span></p>
              <button type="button" className="block text-left hover:underline" onClick={() => openConflictDetails("class")}>Trùng lớp: <span className="font-semibold text-foreground">{overview.classConflicts}</span></button>
              <button type="button" className="block text-left hover:underline" onClick={() => openConflictDetails("teaching")}>Trùng lịch dạy: <span className="font-semibold text-foreground">{overview.teachingConflicts}</span></button>
              <button type="button" className="block text-left hover:underline" onClick={() => openConflictDetails("room")}>Trùng phòng: <span className="font-semibold text-foreground">{overview.roomConflicts}</span></button>
              <button type="button" className="block text-left hover:underline" onClick={() => openConflictDetails("subject")}>Trùng môn: <span className="font-semibold text-foreground">{overview.subjectConflicts}</span></button>
              <p className="pt-1 text-xs">Nhấn vào từng loại xung đột để xem danh sách lịch cần dời.</p>
            </CardContent>
          </Card>

          <Card className="border-violet-200/70 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-indigo-100">
            <CardHeader className="pb-2">
              <CardDescription>8. Nguyện vọng giảng viên</CardDescription>
              <CardTitle className="text-lg">Tỷ lệ đáp ứng</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>Tỷ lệ đáp ứng: <span className="font-semibold text-foreground">{overview.preferenceFulfillmentRate}%</span></p>
              <p>Giảng viên vượt định mức: <span className="font-semibold text-foreground">{overloadedCount}</span></p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-blue-200/60 bg-gradient-to-br from-white to-blue-50">
          <CardHeader>
            <CardTitle>2. Thống kê tải giảng dạy giảng viên</CardTitle>
            <CardDescription>Biểu đồ cột số tiết theo giảng viên</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                periods: {
                  label: "Số tiết",
                  color: "#4f6bed",
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={teacherLoadChart} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={150}
                    tick={{ fontSize: 11 }}
                  />
                  <ChartTooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm">
                            <p className="font-medium text-sm">{data.name}</p>
                            <p className="text-sm text-muted-foreground">Số tiết: {data.periods}</p>
                            <p className="text-xs text-muted-foreground">Số lịch: {data.sessions}</p>
                            <p className="text-xs text-muted-foreground">Trạng thái: {data.overload ? "Vượt định mức" : "Bình thường"}</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Bar dataKey="periods" radius={[0, 4, 4, 0]}>
                    {teacherLoadChart.map((_, index) => (
                      <Cell key={`teacher-cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              <p>Dạy nhiều nhất: <span className="font-semibold text-foreground">{highestLoadTeacher?.name || "-"}</span></p>
              <p>Dạy ít nhất: <span className="font-semibold text-foreground">{lowestLoadTeacher?.name || "-"}</span></p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-cyan-200/60 bg-gradient-to-br from-white to-cyan-50">
          <CardHeader>
            <CardTitle>4. Thống kê lịch theo ngày trong tuần</CardTitle>
            <CardDescription>Biểu đồ đường số lịch theo ngày</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                count: {
                  label: "Số lịch",
                  color: "#4f6bed",
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats?.dailySchedules || []} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <ChartTooltip 
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm">
                            <p className="font-medium text-sm">{label}</p>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-[#4f6bed]" />
                              <span className="text-sm text-muted-foreground">Số lịch: {payload[0]?.value}</span>
                            </div>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={{ fill: "#0284c7", r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border-fuchsia-200/60 bg-gradient-to-br from-white to-fuchsia-50">
          <CardHeader>
            <CardTitle>5. Thống kê theo ngành</CardTitle>
            <CardDescription>Biểu đồ tròn phân bố lịch dạy theo ngành</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={majorPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="schedules"
                    label={({ payload }: any) => `${payload?.majorName || ""}: ${payload?.schedules || 0}`}
                    labelLine={false}
                  >
                    {majorPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: data.color }} />
                              <span className="font-medium">{data.majorName}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">Số lịch: {data.schedules}</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-4">
              {majorPieData.map((item) => (
                <div key={item.majorName} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-muted-foreground">{item.majorName}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200/60 bg-gradient-to-br from-white to-emerald-50">
          <CardHeader>
            <CardTitle>3. Thống kê sử dụng phòng học</CardTitle>
            <CardDescription>Phòng dùng nhiều và phòng bỏ trống</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                usedSessions: {
                  label: "Số lịch",
                  color: "#4f6bed",
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roomUsageChart} margin={{ top: 20, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <ChartTooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm">
                            <p className="font-medium text-sm">{data.name}</p>
                            <p className="text-sm text-muted-foreground">Số lịch: {data.usedSessions}</p>
                            <p className="text-xs text-muted-foreground">Tỷ lệ dùng: {data.usageRate}%</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Bar dataKey="usedSessions" fill="#4f6bed" radius={[4, 4, 0, 0]}>
                    {roomUsageChart.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.usageRate > 15 ? "#22c55e" : entry.usageRate > 7 ? "#f59e0b" : "#ef4444"} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
            <div className="mt-4 space-y-1 text-sm text-muted-foreground">
              <p>Phòng dùng nhiều nhất: <span className="font-semibold text-foreground">{roomUsageChart[0]?.name || "-"}</span></p>
              <p>Phòng bỏ trống: <span className="font-semibold text-foreground">{(stats?.unusedRooms || []).slice(0, 5).map((item) => item.name).join(", ") || "Không có"}</span></p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={openConflictDialog} onOpenChange={setOpenConflictDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>{conflictTypeLabel[selectedConflictType]}: {selectedConflictGroups.length} nhóm xung đột</DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="default" onClick={resolveAllConflicts} disabled={bulkResolving}>
              {bulkResolving ? "Đang xử lý tất cả..." : "Xử lý tất cả xung đột"}
            </Button>
            {bulkResolveMessage && <p className="text-xs text-muted-foreground">{bulkResolveMessage}</p>}
          </div>

          {selectedConflictGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có xung đột cho loại này trong năm đã chọn.</p>
          ) : (
            <div className="space-y-3">
              {selectedConflictGroups.map((group, groupIndex) => (
                <div key={`${group.key}-${groupIndex}`} className="rounded-lg border border-border/60 bg-muted/10 p-3">
                  <p className="text-sm font-medium text-foreground">
                    {group.date} • {group.session || "Chưa xác định buổi"} • {group.schedules.length} lịch bị chồng
                  </p>
                  <div className="mt-2 space-y-2">
                    {group.schedules.map((item) => (
                      <div key={`${group.key}-${item.id}`} className="rounded border border-border/50 bg-background p-2 text-sm">
                        <p className="font-medium text-foreground">Lịch #{item.id}: {item.courseName}</p>
                        <p className="text-muted-foreground">Lớp: <span className="font-medium text-foreground">{item.className}</span> • Giảng viên: <span className="font-medium text-foreground">{item.instructorName}</span></p>
                        <p className="text-muted-foreground">Phòng: <span className="font-medium text-foreground">{item.roomName}</span> • Trạng thái: <span className="font-medium text-foreground">{item.status || "Đang diễn ra"}</span></p>
                        <div className="mt-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => openReschedule(item)} disabled={isPausedStatus(item.status)}>
                            Điều chỉnh lịch
                          </Button>
                          {isPausedStatus(item.status) && <p className="mt-1 text-xs text-muted-foreground">Lịch này đang tạm ngưng/tạm dừng nên không cần điều chỉnh.</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">Gợi ý: vào mục Thời khóa biểu, bấm Điều chỉnh theo mã lịch để dời lịch và tránh xung đột.</p>
        </DialogContent>
      </Dialog>

      <Dialog open={openRescheduleDialog} onOpenChange={setOpenRescheduleDialog}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Điều chỉnh lịch #{rescheduleTarget?.id || ""}</DialogTitle>
          </DialogHeader>

          {rescheduleLoading && <p className="text-sm text-muted-foreground">Đang tải tùy chọn dời lịch...</p>}
          {rescheduleError && <p className="text-sm text-destructive">{rescheduleError}</p>}
          {rescheduleMessage && <p className="text-sm text-emerald-700">{rescheduleMessage}</p>}

          {rescheduleOptions && (
            <div className="space-y-3 text-sm">
              <div className="rounded border border-border/60 bg-muted/10 p-3">
                <p><span className="text-muted-foreground">Môn:</span> <span className="font-medium text-foreground">{rescheduleOptions.schedule.courseName}</span></p>
                <p><span className="text-muted-foreground">Lớp:</span> <span className="font-medium text-foreground">{rescheduleOptions.schedule.className}</span></p>
                <p><span className="text-muted-foreground">Giảng viên:</span> <span className="font-medium text-foreground">{rescheduleOptions.schedule.instructorName}</span></p>
                <p><span className="text-muted-foreground">Ngày cũ:</span> <span className="font-medium text-foreground">{rescheduleOptions.schedule.oldDate}</span></p>
              </div>

              {(rescheduleOptions.availableSlots || []).length > 0 ? (
                <>
                  <div>
                    <p className="mb-1 text-muted-foreground">Chọn ngày và buổi mới</p>
                    <Select value={rescheduleSlot} onValueChange={setRescheduleSlot}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn ngày và buổi dời lịch" />
                      </SelectTrigger>
                      <SelectContent>
                        {(rescheduleOptions.availableSlots || []).map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" onClick={submitReschedule} disabled={rescheduleSubmitting || !rescheduleSlot}>
                    {rescheduleSubmitting ? "Đang điều chỉnh..." : "Xác nhận điều chỉnh"}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Không còn tùy chọn ngày/buổi hợp lệ để dời lịch trong học kỳ.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
