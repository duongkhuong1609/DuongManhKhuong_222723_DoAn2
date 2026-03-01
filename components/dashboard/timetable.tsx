"use client"

import { useState } from "react"
import { Filter, ChevronLeft, ChevronRight } from "lucide-react"
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
import { cn } from "@/lib/utils"

const days = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"]

const timeslots = [
  { id: 1, name: "Tiết 1-2", time: "07:00 - 08:50" },
  { id: 2, name: "Tiết 3-4", time: "09:00 - 10:50" },
  { id: 3, name: "Tiết 5-6", time: "13:00 - 14:50" },
  { id: 4, name: "Tiết 7-8", time: "15:00 - 16:50" },
  { id: 5, name: "Tiết 9-10", time: "17:30 - 19:20" },
]

// scheduleData will be fetched from the server when backend is ready
const scheduleData: Array<any> = []

// colors may come from course definitions later
const courseColors: Record<string, string> = {}

export function TimetableView() {
  const [semester, setSemester] = useState("hk1")
  const [instructor, setInstructor] = useState("all")
  const [week, setWeek] = useState(1)

  const filteredSchedule = scheduleData.filter(item => {
    if (instructor !== "all" && item.instructor !== instructor) return false
    return true
  })

  const getScheduleForCell = (dayIndex: number, slotId: number) => {
    return filteredSchedule.find(item => item.day === dayIndex && item.slot === slotId)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Xem thời khóa biểu</h2>
          <p className="text-muted-foreground">
            Xem lịch giảng dạy theo tuần, học kỳ và giảng viên
          </p>
        </div>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setWeek(Math.max(1, week - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[100px] text-center font-medium">Tuần {week}</span>
              <Button variant="outline" size="icon" onClick={() => setWeek(Math.min(20, week + 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={semester} onValueChange={setSemester}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hk1">Học kỳ 1</SelectItem>
                    <SelectItem value="hk2">Học kỳ 2</SelectItem>
                    <SelectItem value="hkhe">Học kỳ hè</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Select value={instructor} onValueChange={setInstructor}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Chọn giảng viên" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả giảng viên</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Header */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                <div className="p-3 text-center font-medium text-muted-foreground bg-muted/30 rounded-lg">
                  Tiết học
                </div>
                {days.map((day) => (
                  <div key={day} className="p-3 text-center font-medium text-foreground bg-muted/30 rounded-lg">
                    {day}
                  </div>
                ))}
              </div>

              {/* Body */}
              <div className="space-y-1">
                {timeslots.map((slot) => (
                  <div key={slot.id} className="grid grid-cols-7 gap-1">
                    <div className="p-3 text-center bg-muted/20 rounded-lg">
                      <div className="font-medium text-sm text-foreground">{slot.name}</div>
                      <div className="text-xs text-muted-foreground">{slot.time}</div>
                    </div>
                    {days.map((_, dayIndex) => {
                      const schedule = getScheduleForCell(dayIndex, slot.id)
                      return (
                        <div 
                          key={dayIndex} 
                          className={cn(
                            "p-2 rounded-lg min-h-[80px] transition-colors",
                            schedule 
                              ? `${courseColors[schedule.course] || "bg-muted/20"} border` 
                              : "bg-muted/10 hover:bg-muted/20"
                          )}
                        >
                          {schedule && (
                            <div className="h-full flex flex-col justify-between">
                              <div>
                                <p className="font-medium text-sm leading-tight">{schedule.course}</p>
                                <p className="text-xs opacity-80 mt-0.5">{schedule.class}</p>
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {schedule.room}
                                </Badge>
                              </div>
                            </div>
                          )}
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
