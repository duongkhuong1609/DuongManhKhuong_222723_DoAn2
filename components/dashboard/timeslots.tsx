"use client"

import { useState } from "react"
import { Plus, Edit, Trash2, Clock, Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

const initialTimeslots: any[] = []

export function TimeslotsModule() {
  const [timeslots, setTimeslots] = useState(initialTimeslots)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newTimeslot, setNewTimeslot] = useState({
    name: "",
    startTime: "",
    endTime: "",
    period: "Sáng"
  })

  const handleAddTimeslot = () => {
    if (newTimeslot.name && newTimeslot.startTime && newTimeslot.endTime) {
      const start = new Date(`2000-01-01T${newTimeslot.startTime}`)
      const end = new Date(`2000-01-01T${newTimeslot.endTime}`)
      const duration = Math.round((end.getTime() - start.getTime()) / 60000)
      
      setTimeslots([
        ...timeslots,
        { ...newTimeslot, id: timeslots.length + 1, duration }
      ])
      setNewTimeslot({ name: "", startTime: "", endTime: "", period: "Sáng" })
      setIsAddOpen(false)
    }
  }

  const handleDeleteTimeslot = (id: number) => {
    setTimeslots(timeslots.filter((t) => t.id !== id))
  }

  const getPeriodIcon = (period: string) => {
    switch (period) {
      case "Sáng":
        return <Sun className="h-4 w-4 text-warning" />
      case "Chiều":
        return <Sun className="h-4 w-4 text-chart-1" />
      case "Tối":
        return <Moon className="h-4 w-4 text-chart-3" />
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
      case "Tối":
        return "bg-chart-3/10 text-chart-3"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Quản lý Giờ học</h2>
          <p className="text-muted-foreground">
            Cấu hình các khung giờ học trong ngày
          </p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Thêm giờ học
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Thêm khung giờ học mới</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Tên tiết học</Label>
                <Input
                  id="name"
                  placeholder="VD: Tiết 1-2"
                  value={newTimeslot.name}
                  onChange={(e) => setNewTimeslot({ ...newTimeslot, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="startTime">Giờ bắt đầu</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={newTimeslot.startTime}
                    onChange={(e) => setNewTimeslot({ ...newTimeslot, startTime: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="endTime">Giờ kết thúc</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={newTimeslot.endTime}
                    onChange={(e) => setNewTimeslot({ ...newTimeslot, endTime: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="period">Buổi học</Label>
                <Select
                  value={newTimeslot.period}
                  onValueChange={(value) => setNewTimeslot({ ...newTimeslot, period: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn buổi học" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sáng">Sáng</SelectItem>
                    <SelectItem value="Chiều">Chiều</SelectItem>
                    <SelectItem value="Tối">Tối</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Hủy</Button>
              </DialogClose>
              <Button onClick={handleAddTimeslot}>Thêm giờ học</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {["Sáng", "Chiều", "Tối"].map((period) => (
          <Card key={period} className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {getPeriodIcon(period)}
                Buổi {period}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {timeslots.filter(t => t.period === period).map((slot) => (
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
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {timeslots.map((slot) => (
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
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteTimeslot(slot.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
