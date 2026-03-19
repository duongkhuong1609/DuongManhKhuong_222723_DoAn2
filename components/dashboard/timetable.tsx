"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Calendar } from "@/components/ui/calendar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const days = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"]

const sessionBands = [
  { id: "sang", label: "Buổi sáng", subLabel: "Tiết 1–6", minStart: 1, maxStart: 6 },
  { id: "chieu", label: "Buổi chiều", subLabel: "Tiết 7–12", minStart: 7, maxStart: 12 },
]

interface InstructorOption {
  id: string
  name: string
  email?: string
}

interface ScheduleCell {
  id: string
  day: number
  slot: number
  periodStart?: number
  periodEnd?: number
  course: string
  class: string
  instructor: string
  room: string
  semester: string
  date?: string
  session?: string
  periods?: number
  trangThai?: string
  raw?: {
    maMon?: number
    maLop?: number
    maGV?: number
    maPhong?: number
    buoi?: string
    soTietDay?: number
    ngayDay?: string
  }
}

interface RescheduleOptionPayload {
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

interface ClassCourseItem {
  maMon: number
  tenMon: string
  soTinChi: number
}

interface ClassSummary {
  totalCourses: number
  totalCredits: number
  totalPeriods?: number
  courses: ClassCourseItem[]
}

// colors may come from course definitions later
const courseColors: Record<string, string> = {}

const formatDate = (value?: string) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("vi-VN")
}

const toIsoDateLocal = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const parseIsoDateLocal = (value: string) => {
  const [yearRaw, monthRaw, dayRaw] = String(value || "").split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return undefined
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return undefined
  return date
}

const getIsoWeekInfo = (value: Date) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum)
  const isoYear = utcDate.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  if (!Number.isFinite(week) || week <= 0) return null
  return { week, year: isoYear }
}

const getMondayFromIsoWeek = (weekYear: number, week: number) => {
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4))
  const firstThursdayDay = firstThursday.getUTCDay() || 7
  const weekOneMonday = new Date(firstThursday)
  weekOneMonday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDay + 1)

  const monday = new Date(weekOneMonday)
  monday.setUTCDate(weekOneMonday.getUTCDate() + (week - 1) * 7)
  monday.setUTCHours(12, 0, 0, 0)
  return monday
}

const formatPeriodLabel = (session?: string) => {
  const label = String(session || "").trim()
  // If already a range like "1-5", show directly
  const rangeMatch = label.match(/(\d+)\s*-\s*(\d+)/)
  if (rangeMatch) return `Tiết ${rangeMatch[1]}–${rangeMatch[2]}`
  // Fallback: show session text as-is
  return label || "Tiết?"
}

const isPracticeCourseName = (courseName?: string) => {
  const normalized = String(courseName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
  return /\s*-\s*thuc hanh$/.test(normalized) || normalized.endsWith(" thuc hanh")
}

export function TimetableView({ userMode = false }: { userMode?: boolean }) {
  const todayIso = useMemo(() => toIsoDateLocal(new Date()), [])
  const initialWeekInfo = useMemo(() => getIsoWeekInfo(new Date()), [])
  const [department, setDepartment] = useState("all")
  const [major, setMajor] = useState("all")
  const [classId, setClassId] = useState("all")
  const [openClassPopover, setOpenClassPopover] = useState(false)
  const [instructor, setInstructor] = useState("all")
  const [openInstructorPopover, setOpenInstructorPopover] = useState(false)
  const [openAnchorDatePopover, setOpenAnchorDatePopover] = useState(false)
  const [week, setWeek] = useState("0")
  const [weekYear, setWeekYear] = useState(String(initialWeekInfo?.year || new Date().getFullYear()))
  const [weekYearOptions, setWeekYearOptions] = useState<number[]>([])
  const [weekStartDateMap, setWeekStartDateMap] = useState<Record<string, string>>({})
  const [academicYearStart, setAcademicYearStart] = useState(String(new Date().getFullYear() - 1))
  const [anchorDate, setAnchorDate] = useState(todayIso)
  const [scheduleData, setScheduleData] = useState<ScheduleCell[]>([])
  const [weekOptions, setWeekOptions] = useState<number[]>([])
  const [weekDates, setWeekDates] = useState<string[]>([])
  const [anchorDateOptions, setAnchorDateOptions] = useState<Array<{ value: string; label: string }>>([])
  const [departmentOptions, setDepartmentOptions] = useState<Array<{ id: string; name: string }>>([])
  const [majorOptions, setMajorOptions] = useState<Array<{ id: string; name: string }>>([])
  const [classOptions, setClassOptions] = useState<Array<{ id: string; name: string }>>([])
  const [instructorOptions, setInstructorOptions] = useState<InstructorOption[]>([])
  const [classSummary, setClassSummary] = useState<ClassSummary | null>(null)
  const [isCoursesDialogOpen, setIsCoursesDialogOpen] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState<ScheduleCell | null>(null)
  const [rescheduleOptions, setRescheduleOptions] = useState<RescheduleOptionPayload | null>(null)
  const [rescheduleSlot, setRescheduleSlot] = useState("")
  const [rescheduleLoading, setRescheduleLoading] = useState(false)
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false)
  const [rescheduleError, setRescheduleError] = useState("")
  const [rescheduleMessage, setRescheduleMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const loadTimetable = async () => {
      try {
        setLoading(true)
        setError("")

        const params = new URLSearchParams({
          week,
          weekYear,
          anchorDate,
          academicYearStart,
          department,
          major,
          classId,
          instructor,
        })

        const response = await fetch(`/api/schedules/timetable?${params.toString()}`, { cache: "no-store" })
        const payload = await response.json()

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Không thể tải thời khóa biểu")
        }

        setScheduleData(payload.data.schedule || [])
        setClassSummary(payload.data.classSummary ?? null)
        setWeekOptions(payload.data.filters?.weeks || [])
        setWeekYearOptions(payload.data.filters?.weekYears || [])
        setWeekStartDateMap(payload.data.filters?.weekStartDates || {})
        setWeekDates(payload.data.filters?.weekDates || [])
        setAnchorDateOptions(payload.data.filters?.anchorDates || [])
        setDepartmentOptions(payload.data.filters?.departments || [])
        setMajorOptions(payload.data.filters?.majors || [])
        setClassOptions(payload.data.filters?.classes || [])
        setInstructorOptions(payload.data.filters?.instructors || [])

        const backendWeekYear = Number(payload.data.filters?.selectedWeekYear || 0)
        if (Number.isFinite(backendWeekYear) && backendWeekYear > 0 && String(backendWeekYear) !== weekYear) {
          setWeekYear(String(backendWeekYear))
        }

        const backendAcademicYearStart = Number(payload.data.filters?.academicYearStart || 0)
        if (Number.isFinite(backendAcademicYearStart) && backendAcademicYearStart > 0 && String(backendAcademicYearStart) !== academicYearStart) {
          setAcademicYearStart(String(backendAcademicYearStart))
        }

        const currentWeek = Number(payload.data.filters?.currentWeek || 0)
        if (Number.isFinite(currentWeek) && currentWeek > 0 && String(currentWeek) !== week) {
          setWeek(String(currentWeek))
        }

        const currentAnchorDate = String(payload.data.filters?.currentAnchorDate || "").trim()
        if (currentAnchorDate && currentAnchorDate !== anchorDate) {
          setAnchorDate(currentAnchorDate)
        }
      } catch (err: any) {
        setScheduleData([])
        setError(String(err?.message || "Lỗi khi tải dữ liệu thời khóa biểu"))
      } finally {
        setLoading(false)
      }
    }

    loadTimetable()
  }, [department, major, classId, instructor, week, weekYear, anchorDate, academicYearStart, refreshToken])

  const openRescheduleDialog = async (schedule: ScheduleCell) => {
    if (userMode) return

    setRescheduleTarget(schedule)
    setRescheduleLoading(true)
    setRescheduleError("")
    setRescheduleMessage("")
    setRescheduleOptions(null)
    setRescheduleSlot("")
    setIsRescheduleDialogOpen(true)

    try {
      const params = new URLSearchParams({
        mode: "reschedule-options",
        scheduleId: String(schedule.id || ""),
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
    if (!rescheduleTarget || !rescheduleSlot) {
      setRescheduleError("Vui lòng chọn ngày và buổi mới để dời lịch")
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
      setRefreshToken((prev) => prev + 1)
    } catch (err: any) {
      setRescheduleError(String(err?.message || "Lỗi khi điều chỉnh lịch dạy"))
    } finally {
      setRescheduleSubmitting(false)
    }
  }

  const filteredSchedule = useMemo(() => scheduleData, [scheduleData])
  const canViewScheduleByClass = userMode ? true : department !== "all" && major !== "all" && classId !== "all"
  const canViewScheduleByInstructor = instructor !== "all"
  const canViewSchedule = canViewScheduleByClass || canViewScheduleByInstructor
  const selectedInstructorOption = useMemo(
    () => instructorOptions.find((item) => item.id === instructor),
    [instructorOptions, instructor],
  )
  const instructorDisplayLabel = selectedInstructorOption
    ? `${selectedInstructorOption.name} (${selectedInstructorOption.email || "-"})`
    : "Giảng viên có lịch dạy"

  const getSchedulesForBand = (dayIndex: number, minStart: number, maxStart: number) => {
    return filteredSchedule.filter(item => {
      if (item.day !== dayIndex) return false
      const start = Number(item.periodStart || item.slot || 1)
      return start >= minStart && start <= maxStart
    })
  }

  const currentWeekIndex = weekOptions.findIndex((item) => String(item) === week)
  const selectedAnchorDate = parseIsoDateLocal(anchorDate)
  const mondayOfDisplayedWeek = weekDates.length > 0 ? weekDates[0] : ""
  const anchorButtonLabel = selectedAnchorDate
    ? formatDate(anchorDate)
    : mondayOfDisplayedWeek
      ? `${formatDate(mondayOfDisplayedWeek)} (Thứ 2)`
      : formatDate(todayIso)

  const resolveMondayByWeek = (targetWeek: string, targetYear: string) => {
    const key = `${targetYear}-${targetWeek}`
    const mapped = weekStartDateMap[key]
    if (mapped) return mapped

    const yearNumber = Number(targetYear)
    const weekNumber = Number(targetWeek)
    if (Number.isFinite(yearNumber) && Number.isFinite(weekNumber) && weekNumber > 0) {
      return toIsoDateLocal(getMondayFromIsoWeek(yearNumber, weekNumber))
    }
    return anchorDate
  }

  const dayDateMap = useMemo(() => {
    const map = new Map<number, string>()
    weekDates.forEach((value, index) => {
      const text = formatDate(value)
      if (text) map.set(index, text)
    })
    for (const item of filteredSchedule) {
      if (typeof item.day !== "number") continue
      if (!map.has(item.day)) {
        const text = formatDate(item.date)
        if (text) map.set(item.day, text)
      }
    }
    return map
  }, [filteredSchedule, weekDates])

  useEffect(() => {
    if (userMode) {
      const hasCurrentClass = classOptions.some((item) => item.id === classId)
      if (!hasCurrentClass && classId !== "all") {
        setClassId("all")
      }
      return
    }

    if (major === "all") {
      if (classId !== "all") setClassId("all")
      return
    }

    const hasCurrentClass = classOptions.some((item) => item.id === classId)
    if (!hasCurrentClass && classId !== "all") {
      setClassId("all")
    }
  }, [major, classOptions, classId, userMode])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Xem thời khóa biểu</h2>
          <p className="text-muted-foreground">
            {userMode ? "Xem lịch dạy cá nhân theo lớp, tuần và mốc thời gian" : "Xem lịch giảng dạy theo khoa, ngành, lớp và giảng viên"}
          </p>
        </div>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (currentWeekIndex > 0) {
                      const nextWeek = String(weekOptions[currentWeekIndex - 1])
                      setWeek(nextWeek)
                      setAnchorDate(resolveMondayByWeek(nextWeek, weekYear))
                    }
                  }}
                  disabled={currentWeekIndex <= 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (currentWeekIndex >= 0 && currentWeekIndex < weekOptions.length - 1) {
                      const nextWeek = String(weekOptions[currentWeekIndex + 1])
                      setWeek(nextWeek)
                      setAnchorDate(resolveMondayByWeek(nextWeek, weekYear))
                    }
                  }}
                  disabled={currentWeekIndex < 0 || currentWeekIndex >= weekOptions.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Select value={weekYear} onValueChange={(value) => {
                setWeekYear(value)
                const initialWeek = "1"
                setWeek(initialWeek)
                setAnchorDate(resolveMondayByWeek(initialWeek, value))
              }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Năm" />
                </SelectTrigger>
                <SelectContent>
                  {weekYearOptions.map((item) => (
                    <SelectItem key={item} value={String(item)}>Năm {item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={week} onValueChange={(value) => {
                setWeek(value)
                setAnchorDate(resolveMondayByWeek(value, weekYear))
              }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Chọn tuần" />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions.map((item) => (
                    <SelectItem key={item} value={String(item)}>Tuần {item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover open={openAnchorDatePopover} onOpenChange={setOpenAnchorDatePopover}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[220px] justify-start text-left font-normal">
                    <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                    {anchorButtonLabel || "Chọn mốc thời gian"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedAnchorDate}
                    onSelect={(date) => {
                      if (!date) return
                      const isoDate = toIsoDateLocal(date)
                      setAnchorDate(isoDate)
                      const info = getIsoWeekInfo(date)
                      if (info) {
                        setWeek(String(info.week))
                        setWeekYear(String(info.year))
                      }
                      setOpenAnchorDatePopover(false)
                    }}
                    captionLayout="dropdown"
                    fromYear={2020}
                    toYear={2035}
                    initialFocus
                  />
                  <div className="flex items-center justify-between border-t px-3 py-2">
                    <Select
                      value={anchorDate}
                      onValueChange={(value) => {
                        setAnchorDate(value)
                        const parsed = parseIsoDateLocal(value)
                        if (parsed) {
                          const info = getIsoWeekInfo(parsed)
                          if (info) {
                            setWeek(String(info.week))
                            setWeekYear(String(info.year))
                          }
                        }
                        setOpenAnchorDatePopover(false)
                      }}
                    >
                      <SelectTrigger className="h-8 w-[140px]">
                        <SelectValue placeholder="Ngày đã có lịch" />
                      </SelectTrigger>
                      <SelectContent>
                        {anchorDateOptions.slice(0, 20).map((item) => (
                          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </PopoverContent>
              </Popover>
              {!userMode && (
                <Select value={department} onValueChange={(value) => {
                  setDepartment(value)
                  setMajor("all")
                  setClassId("all")
                  setInstructor("all")
                }}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Chọn khoa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Chọn khoa</SelectItem>
                    {departmentOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!userMode && (
                <Select value={major} onValueChange={(value) => {
                  setMajor(value)
                  setClassId("all")
                  setInstructor("all")
                }}>
                  <SelectTrigger className="w-[200px]" disabled={department === "all"}>
                    <SelectValue placeholder="Chọn ngành" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Chọn ngành</SelectItem>
                    {majorOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Popover open={openClassPopover} onOpenChange={setOpenClassPopover}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[220px] justify-between" disabled={!userMode && major === "all"}>
                    {classId === "all"
                      ? "Chọn lớp"
                      : classOptions.find((item) => item.id === classId)?.name || "Chọn lớp"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Tra cứu lớp..." />
                    <CommandList>
                      <CommandEmpty>Không tìm thấy lớp phù hợp.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="all"
                          onSelect={() => {
                            setClassId("all")
                            setOpenClassPopover(false)
                          }}
                        >
                          Chọn lớp
                        </CommandItem>
                        {classOptions.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={item.name}
                            onSelect={() => {
                              setClassId(item.id)
                              setOpenClassPopover(false)
                            }}
                          >
                            {item.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {!userMode && (
                <Popover open={openInstructorPopover} onOpenChange={setOpenInstructorPopover}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-[280px] justify-start" title={instructorDisplayLabel}>
                      <span className="block w-full truncate text-left">
                        {instructorDisplayLabel}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Tra cứu giảng viên..." />
                      <CommandList>
                        <CommandEmpty>Không tìm thấy giảng viên.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all"
                            onSelect={() => {
                              setInstructor("all")
                              setOpenInstructorPopover(false)
                            }}
                          >
                            Giảng viên có lịch dạy
                          </CommandItem>
                          {instructorOptions.map((item) => (
                            <CommandItem
                              key={item.id}
                              value={`${item.name} ${item.email || ""}`}
                              onSelect={() => {
                                setInstructor(item.id)
                                setOpenInstructorPopover(false)
                              }}
                            >
                              {item.name} ({item.email || "-"})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <p className="mb-3 text-sm text-muted-foreground">Đang tải thời khóa biểu...</p>}
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          {!canViewSchedule && (
            <p className="mb-3 text-sm text-muted-foreground">{userMode ? "Vui lòng chọn lớp để xem lịch dạy." : "Vui lòng chọn Giảng viên hoặc chọn lần lượt Khoa, Ngành và Lớp để xem lịch."}</p>
          )}
          {canViewSchedule && classSummary && (
            <div className="mb-4 flex flex-wrap gap-4 rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Tổng số môn:</span>
                <button
                  type="button"
                  className="font-semibold text-foreground underline-offset-2 hover:underline"
                  onClick={() => setIsCoursesDialogOpen(true)}
                >
                  {classSummary.totalCourses} môn
                </button>
              </div>
              <div className="h-4 w-px bg-border/60" />
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{userMode ? "Tổng số tiết dạy:" : "Tổng tín chỉ:"}</span>
                <span className="font-semibold text-foreground">{userMode ? `${classSummary.totalPeriods || 0} tiết` : `${classSummary.totalCredits} tín chỉ`}</span>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Header */}
              <div className="grid grid-cols-8 gap-1 mb-1">
                <div className="p-3 text-center font-medium text-muted-foreground bg-muted/30 rounded-lg">
                  Tiết học
                </div>
                {days.map((day) => (
                  <div key={day} className="p-3 text-center font-medium text-foreground bg-muted/30 rounded-lg">
                    <div>{day}</div>
                    <div className="text-xs text-muted-foreground">
                      {dayDateMap.get(days.indexOf(day)) || ""}
                    </div>
                  </div>
                ))}
              </div>

              {/* Body */}
              <div className="space-y-1">
                {sessionBands.map((band) => (
                  <div key={band.id} className="grid grid-cols-8 gap-1">
                    <div className="p-3 text-center bg-muted/20 rounded-lg">
                      <div className="font-medium text-sm text-foreground">{band.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{band.subLabel}</div>
                    </div>
                    {days.map((_, dayIndex) => {
                      const schedules = canViewSchedule ? getSchedulesForBand(dayIndex, band.minStart, band.maxStart) : []
                      return (
                        <div
                          key={dayIndex}
                          className={cn(
                            "p-2 rounded-lg min-h-[80px] transition-colors",
                            schedules.length > 0
                              ? `${courseColors[schedules[0].course] || "bg-muted/20"} border`
                              : "bg-muted/10 hover:bg-muted/20"
                          )}
                        >
                          {schedules.map((schedule) => (
                            <div
                              key={schedule.id}
                              className={cn(
                                "mb-2 rounded border p-1.5 last:mb-0",
                                isPracticeCourseName(schedule.course)
                                  ? "border-sky-200 bg-sky-50"
                                  : "bg-background/60"
                              )}
                            >
                              <p className="font-medium text-sm leading-tight">{schedule.course}</p>
                              <p className="text-xs opacity-80 mt-0.5">{schedule.class}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {formatPeriodLabel(schedule.session)}
                              </p>
                              <p className={cn("text-[10px] mt-0.5", schedule.trangThai === "Tạm ngưng" ? "text-red-600" : "text-emerald-700")}>
                                {schedule.trangThai || "Đang diễn ra"}
                              </p>
                              <div className="mt-1.5 flex items-center justify-between gap-2">
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{schedule.room}</Badge>
                                <span className="text-[10px] text-muted-foreground truncate">{schedule.instructor}</span>
                              </div>
                              {!userMode && (
                                <div className="mt-2">
                                  <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => openRescheduleDialog(schedule)}>
                                    Điều chỉnh
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Dialog open={isCoursesDialogOpen} onOpenChange={setIsCoursesDialogOpen}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Danh sách môn học của lớp</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {!classSummary?.courses?.length ? (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu môn học cho lớp đã chọn.</p>
            ) : (
              <div className="space-y-2">
                {classSummary.courses.map((course, index) => (
                  <div key={`${course.maMon}-${index}`} className="rounded-md border border-border/60 px-3 py-2">
                    <div className="font-medium text-foreground">{course.tenMon}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Mã môn: {course.maMon} • Tín chỉ: {course.soTinChi}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isRescheduleDialogOpen}
        onOpenChange={(open) => {
          setIsRescheduleDialogOpen(open)
          if (!open) {
            setRescheduleTarget(null)
            setRescheduleOptions(null)
            setRescheduleSlot("")
            setRescheduleError("")
            setRescheduleMessage("")
          }
        }}
      >
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>Điều chỉnh lịch dạy</DialogTitle>
          </DialogHeader>
          {rescheduleLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải tùy chọn dời lịch...</p>
          ) : (
            <div className="space-y-4">
              {rescheduleError ? <p className="text-sm text-destructive">{rescheduleError}</p> : null}
              {rescheduleMessage ? <p className="text-sm text-emerald-700">{rescheduleMessage}</p> : null}

              {rescheduleOptions ? (
                <>
                  <div className="rounded-md border p-3 text-sm">
                    <p><span className="font-medium">Giảng viên:</span> {rescheduleOptions.schedule.instructorName}</p>
                    <p><span className="font-medium">Lớp:</span> {rescheduleOptions.schedule.className}</p>
                    <p><span className="font-medium">Môn:</span> {rescheduleOptions.schedule.courseName}</p>
                    <p><span className="font-medium">Lịch cũ:</span> {formatDate(rescheduleOptions.schedule.oldDate)} ({rescheduleOptions.schedule.session})</p>
                    <p><span className="font-medium">Bắt đầu học kỳ:</span> {formatDate(rescheduleOptions.schedule.semesterStart)}</p>
                    <p><span className="font-medium">Hạn cuối học kỳ:</span> {formatDate(rescheduleOptions.schedule.semesterEnd)}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Chọn ngày và buổi mới</p>
                    <Select value={rescheduleSlot} onValueChange={setRescheduleSlot}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn ngày và buổi dời lịch" />
                      </SelectTrigger>
                      <SelectContent>
                        {(rescheduleOptions.availableSlots || []).length === 0 ? (
                          <SelectItem value="none" disabled>Không còn tùy chọn hợp lệ</SelectItem>
                        ) : (
                          (rescheduleOptions.availableSlots || []).map((item) => (
                            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Chỉ hiển thị các tùy chọn không xung đột trong phạm vi học kỳ, bao gồm cả cùng ngày nhưng đổi buổi.
                    </p>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsRescheduleDialogOpen(false)} disabled={rescheduleSubmitting}>
                      Đóng
                    </Button>
                    <Button
                      onClick={submitReschedule}
                      disabled={rescheduleSubmitting || !rescheduleSlot || rescheduleSlot === "none"}
                    >
                      {rescheduleSubmitting ? "Đang lưu..." : "Xác nhận điều chỉnh"}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
