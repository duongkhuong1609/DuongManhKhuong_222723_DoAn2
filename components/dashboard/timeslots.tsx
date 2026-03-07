"use client"

import { Clock, Sun } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

const timeslots: any[] = [
  { id: 1, name: "1-3", startTime: "07:00", endTime: "09:00", duration: 120, period: "Sáng" },
  { id: 2, name: "4-6", startTime: "09:30", endTime: "11:30", duration: 120, period: "Sáng" },
  { id: 3, name: "7-9", startTime: "13:00", endTime: "15:00", duration: 120, period: "Chiều" },
  { id: 4, name: "10-12", startTime: "15:30", endTime: "17:30", duration: 120, period: "Chiều" },
  { id: 5, name: "1-5", startTime: "07:00", endTime: "11:00", duration: 240, period: "Sáng" },
  { id: 6, name: "7-11", startTime: "13:00", endTime: "17:00", duration: 240, period: "Chiều" },
]

export function TimeslotsModule() {
  const getPeriodIcon = (period: string) => {
    switch (period) {
      case "Sáng":
        return <Sun className="h-4 w-4 text-warning" />
      case "Chiều":
        return <Sun className="h-4 w-4 text-chart-1" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const getPeriodColor = (period: string) => {
    switch (period) {
      case "Sáng":
        return "bg-warning/10 text-warning"
      case "Chiều":
        return "bg-chart-1/10 text-chart-1"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Xem giờ dạy</h2>
          <p className="text-muted-foreground">
            Danh sách khung giờ học (chỉ xem)
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {["Sáng", "Chiều"].map((period) => (
          <Card key={period} className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {getPeriodIcon(period)}
                Buổi {period}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {timeslots
                  .filter((t) => t.period === period)
                  .sort((a, b) => a.id - b.id)
                  .map((slot) => (
                  <div key={slot.id} className={`flex items-center justify-between rounded-lg p-3 ${getPeriodColor(period)}`}>
                    <div>
                      <p className="font-medium">{slot.name}</p>
                      <p className="text-sm opacity-80">{slot.startTime} - {slot.endTime}</p>
                    </div>
                    <Badge variant="secondary" className="bg-background/50">
                      {slot.duration} phút
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Danh sách khung giờ</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên tiết</TableHead>
                <TableHead>Giờ bắt đầu</TableHead>
                <TableHead>Giờ kết thúc</TableHead>
                <TableHead>Thời lượng</TableHead>
                <TableHead>Buổi học</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...timeslots]
                .sort((a, b) => a.id - b.id)
                .map((slot) => (
                <TableRow key={slot.id}>
                  <TableCell className="font-medium">{slot.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {slot.startTime}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {slot.endTime}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{slot.duration} phút</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getPeriodIcon(slot.period)}
                      {slot.period}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
