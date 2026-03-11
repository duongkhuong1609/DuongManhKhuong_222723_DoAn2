"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Filter } from "lucide-react"
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
import { cn } from "@/lib/utils"

const days = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"]

const timeslots = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, name: `Tiết ${index + 1}` }))

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
}

// colors may come from course definitions later
const courseColors: Record<string, string> = {}

const formatDate = (value?: string) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("vi-VN")
}

const formatPeriodLabel = (session?: string, periods?: number) => {
  const label = String(session || "").trim()
  if (/\d+\s*-\s*\d+/.test(label)) return `Tiết ${label}`

  const size = Number(periods || 0)
  const normalized = label.toLowerCase()

  const base = normalized.includes("chiều") || normalized.includes("chieu")
    ? 5
    : normalized.includes("tối") || normalized.includes("toi")
      ? 9
      : 1

  const count = size > 0 ? size : 2
  const end = base + count - 1
  return `Tiết ${base}-${end}`
}

export function TimetableView() {
  const [department, setDepartment] = useState("all")
  const [major, setMajor] = useState("all")
  const [classId, setClassId] = useState("all")
  const [instructor, setInstructor] = useState("all")
  const [openInstructorPopover, setOpenInstructorPopover] = useState(false)
  const [week, setWeek] = useState("0")
  const [scheduleData, setScheduleData] = useState<ScheduleCell[]>([])
  const [weekOptions, setWeekOptions] = useState<number[]>([])
  const [weekDates, setWeekDates] = useState<string[]>([])
  const [departmentOptions, setDepartmentOptions] = useState<Array<{ id: string; name: string }>>([])
  const [majorOptions, setMajorOptions] = useState<Array<{ id: string; name: string }>>([])
  const [classOptions, setClassOptions] = useState<Array<{ id: string; name: string }>>([])
  const [instructorOptions, setInstructorOptions] = useState<InstructorOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const loadTimetable = async () => {
      try {
        setLoading(true)
        setError("")

        const params = new URLSearchParams({
          week,
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
        setWeekOptions(payload.data.filters?.weeks || [])
        setWeekDates(payload.data.filters?.weekDates || [])
        setDepartmentOptions(payload.data.filters?.departments || [])
        setMajorOptions(payload.data.filters?.majors || [])
        setClassOptions(payload.data.filters?.classes || [])
        setInstructorOptions(payload.data.filters?.instructors || [])

        const currentWeek = Number(payload.data.filters?.currentWeek || 0)
        if (Number.isFinite(currentWeek) && currentWeek > 0 && String(currentWeek) !== week) {
          setWeek(String(currentWeek))
        }
      } catch (err: any) {
        setScheduleData([])
        setError(String(err?.message || "Lỗi khi tải dữ liệu thời khóa biểu"))
      } finally {
        setLoading(false)
      }
    }

    loadTimetable()
  }, [department, major, classId, instructor, week])

  const filteredSchedule = useMemo(() => scheduleData, [scheduleData])
  const canViewSchedule = department !== "all" && major !== "all" && classId !== "all"

  const getSchedulesForCell = (dayIndex: number, slotId: number) => {
    return filteredSchedule.filter(item => {
      if (item.day !== dayIndex) return false
      const start = Number(item.periodStart || item.slot || 1)
      return start === slotId
    })
  }

  const currentWeekIndex = weekOptions.findIndex((item) => String(item) === week)

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
    if (major === "all") {
      if (classId !== "all") setClassId("all")
      if (instructor !== "all") setInstructor("all")
      return
    }

    const hasCurrentClass = classOptions.some((item) => item.id === classId)
    if (!hasCurrentClass && classId !== "all") {
      setClassId("all")
    }
  }, [major, classOptions, classId])

  useEffect(() => {
    if (classId === "all" && instructor !== "all") {
      setInstructor("all")
    }
  }, [classId, instructor])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Xem thời khóa biểu</h2>
          <p className="text-muted-foreground">
            Xem lịch giảng dạy theo khoa, ngành, lớp và giảng viên
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
                    if (currentWeekIndex > 0) setWeek(String(weekOptions[currentWeekIndex - 1]))
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
                      setWeek(String(weekOptions[currentWeekIndex + 1]))
                    }
                  }}
                  disabled={currentWeekIndex < 0 || currentWeekIndex >= weekOptions.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Select value={week} onValueChange={setWeek}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Chọn tuần" />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions.map((item) => (
                    <SelectItem key={item} value={String(item)}>Tuần {item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className="w-[180px]" disabled={major === "all"}>
                  <SelectValue placeholder="Chọn lớp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Chọn lớp</SelectItem>
                  {classOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover open={openInstructorPopover} onOpenChange={setOpenInstructorPopover}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[280px] justify-between" disabled={!canViewSchedule}>
                    {instructor === "all"
                      ? "Giảng viên có lịch dạy"
                      : instructorOptions.find((item) => item.id === instructor)
                        ? `${instructorOptions.find((item) => item.id === instructor)?.name} (${instructorOptions.find((item) => item.id === instructor)?.email || "-"})`
                        : "Giảng viên có lịch dạy"}
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
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <p className="mb-3 text-sm text-muted-foreground">Đang tải thời khóa biểu...</p>}
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          {!canViewSchedule && (
            <p className="mb-3 text-sm text-muted-foreground">Vui lòng chọn lần lượt Khoa, Ngành và Lớp để xem lịch.</p>
          )}
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Header */}
              <div className="grid grid-cols-7 gap-1 mb-1">
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
                {timeslots.map((slot) => (
                  <div key={slot.id} className="grid grid-cols-7 gap-1">
                    <div className="p-3 text-center bg-muted/20 rounded-lg">
                      <div className="font-medium text-sm text-foreground">{slot.name}</div>
                    </div>
                    {days.map((_, dayIndex) => {
                      const schedules = canViewSchedule ? getSchedulesForCell(dayIndex, slot.id) : []
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
                            <div key={schedule.id} className="mb-2 rounded border bg-background/60 p-1.5 last:mb-0">
                              <div>
                                <p className="font-medium text-sm leading-tight">{schedule.course}</p>
                                <p className="text-xs opacity-80 mt-0.5">{schedule.class}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {formatDate(schedule.date)} • {formatPeriodLabel(schedule.session, schedule.periods)}
                                </p>
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{schedule.room}</Badge>
                                <span className="text-[10px] text-muted-foreground truncate">{schedule.instructor}</span>
                              </div>
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

      {/* Legend */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Chú thích màu sắc</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(courseColors).length === 0 && (
              <span className="text-sm text-muted-foreground">Màu môn học sẽ hiển thị khi cấu hình danh mục môn.</span>
            )}
            {Object.entries(courseColors).map(([course, color]) => (
              <div key={course} className="flex items-center gap-2">
                <div className={cn("w-4 h-4 rounded border", color)} />
                <span className="text-sm text-muted-foreground">{course}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
