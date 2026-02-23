"use client"

import { useState } from "react"
import { Sparkles, Play, RotateCcw, CheckCircle2, AlertCircle, Settings2, ChevronsUpDown, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"

type GenerationStatus = "idle" | "running" | "completed" | "error"

interface GenerationStep {
  name: string
  status: "pending" | "running" | "completed" | "error"
  message?: string
}

const faculties = [
  "Công nghệ thông tin",
  "Khoa học máy tính",
  "Công nghệ phần mềm",
  "Mạng và truyền thông",
]

const majors = {
  "Công nghệ thông tin": ["Lập trình", "Cơ sở dữ liệu", "An niệm mạng"],
  "Khoa học máy tính": ["Khoa học dữ liệu", "Trí tuệ nhân tạo", "Thị giác máy tính"],
  "Công nghệ phần mềm": ["Phát triển phần mềm", "Kiểm thử phần mềm", "Quản lý dự án"],
  "Mạng và truyền thông": ["Mạng máy tính", "Truyền thông", "Hệ thống viễn thông"],
}

export function ScheduleGenerator() {
  const [status, setStatus] = useState<GenerationStatus>("idle")
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [semester, setSemester] = useState("1")
  const [year, setYear] = useState("2024")
  const [selectedFaculty, setSelectedFaculty] = useState("")
  const [selectedMajor, setSelectedMajor] = useState("")
  const [openFacultyPopover, setOpenFacultyPopover] = useState(false)
  const [openMajorPopover, setOpenMajorPopover] = useState(false)
  const [settings, setSettings] = useState({
    avoidConflicts: true,
    optimizeRooms: true,
    balanceWorkload: true,
    respectPreferences: false
  })

  const [steps, setSteps] = useState<GenerationStep[]>([
    { name: "Tải dữ liệu giảng viên và môn học", status: "pending" },
    { name: "Kiểm tra ràng buộc thời gian", status: "pending" },
    { name: "Phân bổ phòng học", status: "pending" },
    { name: "Tối ưu hóa lịch dạy", status: "pending" },
    { name: "Kiểm tra xung đột", status: "pending" },
    { name: "Hoàn tất và lưu lịch", status: "pending" },
  ])

  const startGeneration = async () => {
    setStatus("running")
    setProgress(0)
    setCurrentStep(0)
    
    const newSteps: GenerationStep[] = steps.map(s => ({ ...s, status: "pending" as const }))
    setSteps(newSteps)

    for (let i = 0; i < newSteps.length; i++) {
      setCurrentStep(i)
      newSteps[i].status = "running"
      setSteps([...newSteps])
      
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1500))
      
      newSteps[i].status = "completed"
      newSteps[i].message = getStepMessage(i)
      setSteps([...newSteps])
      setProgress(((i + 1) / newSteps.length) * 100)
    }

    setStatus("completed")
  }

  const getStepMessage = (stepIndex: number): string => {
    const messages = [
      "Đã tải 48 giảng viên, 156 môn học",
      "Kiểm tra 12 ràng buộc thời gian",
      "Phân bổ 32 phòng học cho 89 lớp",
      "Tối ưu 2,456 giờ dạy",
      "Không phát hiện xung đột",
      "Đã lưu thành công"
    ]
    return messages[stepIndex] || ""
  }

  const resetGeneration = () => {
    setStatus("idle")
    setProgress(0)
    setCurrentStep(0)
    setSteps(steps.map(s => ({ ...s, status: "pending", message: undefined })))
  }

  const getStatusBadge = () => {
    switch (status) {
      case "idle":
        return <Badge variant="secondary">Chưa bắt đầu</Badge>
      case "running":
        return <Badge className="bg-primary">Đang xử lý...</Badge>
      case "completed":
        return <Badge className="bg-success text-success-foreground">Hoàn thành</Badge>
      case "error":
        return <Badge variant="destructive">Lỗi</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Lập lịch tự động</h2>
          <p className="text-muted-foreground">
            Hệ thống sẽ tự động xếp lịch dạy dựa trên các ràng buộc đã cấu hình
          </p>
        </div>
        {getStatusBadge()}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border/50 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Tiến trình lập lịch
            </CardTitle>
            <CardDescription>
              Theo dõi tiến trình lập lịch tự động theo từng bước
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tiến trình tổng thể</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-3" />
            </div>

            <div className="space-y-3">
              {steps.map((step, index) => (
                <div 
                  key={index}
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                    step.status === "running" ? "border-primary bg-primary/5" :
                    step.status === "completed" ? "border-success/50 bg-success/5" :
                    step.status === "error" ? "border-destructive/50 bg-destructive/5" :
                    "border-border/50"
                  }`}
                >
                  <div className="mt-0.5">
                    {step.status === "completed" && (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    )}
                    {step.status === "running" && (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    )}
                    {step.status === "error" && (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    )}
                    {step.status === "pending" && (
                      <div className="h-5 w-5 rounded-full border-2 border-muted" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      step.status === "running" ? "text-primary" :
                      step.status === "completed" ? "text-success" :
                      step.status === "error" ? "text-destructive" :
                      "text-muted-foreground"
                    }`}>
                      {step.name}
                    </p>
                    {step.message && (
                      <p className="text-xs text-muted-foreground mt-1">{step.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={startGeneration} 
                disabled={status === "running"}
                className="flex-1"
              >
                <Play className="mr-2 h-4 w-4" />
                {status === "idle" ? "Bắt đầu lập lịch" : status === "running" ? "Đang xử lý..." : "Lập lịch lại"}
              </Button>
              {status !== "idle" && (
                <Button variant="outline" onClick={resetGeneration} disabled={status === "running"}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Đặt lại
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Chọn học kỳ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Năm học</Label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2024">2024 - 2025</SelectItem>
                      <SelectItem value="2025">2025 - 2026</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Học kỳ</Label>
                  <Select value={semester} onValueChange={setSemester}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Học kì 1</SelectItem>
                      <SelectItem value="2">Học kì 2</SelectItem>
                      <SelectItem value="3">Học kì 3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Khoa</Label>
                <Popover open={openFacultyPopover} onOpenChange={setOpenFacultyPopover}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openFacultyPopover}
                      className="w-full justify-between"
                    >
                      {selectedFaculty || "Chọn khoa..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Tìm kiếm khoa..." />
                      <CommandEmpty>Không tìm thấy khoa.</CommandEmpty>
                      <CommandList>
                        <CommandGroup>
                          {faculties.map((faculty) => (
                            <CommandItem
                              key={faculty}
                              value={faculty}
                              onSelect={(currentValue) => {
                                setSelectedFaculty(currentValue === selectedFaculty ? "" : currentValue)
                                setSelectedMajor("")
                                setOpenFacultyPopover(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedFaculty === faculty ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {faculty}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              {selectedFaculty && (
                <div className="grid gap-2">
                  <Label>Ngành</Label>
                  <Popover open={openMajorPopover} onOpenChange={setOpenMajorPopover}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openMajorPopover}
                        className="w-full justify-between"
                      >
                        {selectedMajor || "Chọn ngành..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Tìm kiếm ngành..." />
                        <CommandEmpty>Không tìm thấy ngành.</CommandEmpty>
                        <CommandList>
                          <CommandGroup>
                            {majors[selectedFaculty as keyof typeof majors]?.map((major) => (
                              <CommandItem
                                key={major}
                                value={major}
                                onSelect={(currentValue) => {
                                  setSelectedMajor(currentValue === selectedMajor ? "" : currentValue)
                                  setOpenMajorPopover(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedMajor === major ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {major}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4" />
                Tùy chọn lập lịch
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="conflicts" className="text-sm">Tránh xung đột</Label>
                <Switch 
                  id="conflicts"
                  checked={settings.avoidConflicts}
                  onCheckedChange={(checked) => setSettings({ ...settings, avoidConflicts: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="rooms" className="text-sm">Tối ưu phòng học</Label>
                <Switch 
                  id="rooms"
                  checked={settings.optimizeRooms}
                  onCheckedChange={(checked) => setSettings({ ...settings, optimizeRooms: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="workload" className="text-sm">Cân bằng giờ dạy</Label>
                <Switch 
                  id="workload"
                  checked={settings.balanceWorkload}
                  onCheckedChange={(checked) => setSettings({ ...settings, balanceWorkload: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="preferences" className="text-sm">Ưu tiên yêu cầu GV</Label>
                <Switch 
                  id="preferences"
                  checked={settings.respectPreferences}
                  onCheckedChange={(checked) => setSettings({ ...settings, respectPreferences: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
