"use client"

import { useEffect, useMemo, useState } from "react"
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

interface MajorOption {
  id: string
  name: string
  departmentName: string
}

interface SemesterOption {
  id: string
  name: string
  classYear: string
  majorName: string
}

interface JobStatePayload {
  status: "running" | "completed" | "error"
  progress: number
  steps: GenerationStep[]
  error?: string
  result?: {
    createdRows: number
    unassignedTasks: number
    totalTasks: number
    warnings: string[]
  }
}

export function ScheduleGenerator() {
  const [status, setStatus] = useState<GenerationStatus>("idle")
  const [progress, setProgress] = useState(0)
  const [jobId, setJobId] = useState("")
  const [selectedSemesterId, setSelectedSemesterId] = useState("all")
  const [selectedFaculty, setSelectedFaculty] = useState("")
  const [selectedMajorId, setSelectedMajorId] = useState("")
  const [openFacultyPopover, setOpenFacultyPopover] = useState(false)
  const [openMajorPopover, setOpenMajorPopover] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [resultSummary, setResultSummary] = useState<string[]>([])
  const [majors, setMajors] = useState<MajorOption[]>([])
  const [semesters, setSemesters] = useState<SemesterOption[]>([])

  const [settings, setSettings] = useState({
    avoidConflicts: true,
    optimizeRooms: true,
    balanceWorkload: true,
    respectPreferences: true
  })

  const [steps, setSteps] = useState<GenerationStep[]>([
    { name: "Tải dữ liệu học kỳ, lớp, môn, giảng viên", status: "pending" },
    { name: "Phân tích tác vụ và kiểm tra ràng buộc", status: "pending" },
    { name: "Sinh lịch và tối ưu phân công", status: "pending" },
    { name: "Ghi kết quả vào bảng LICH_DAY", status: "pending" },
    { name: "Hoàn tất", status: "pending" },
  ])

  const faculties = useMemo(
    () => Array.from(new Set(majors.map((item) => item.departmentName).filter(Boolean))),
    [majors],
  )

  const facultyMajors = useMemo(() => {
    if (!selectedFaculty) return []
    return majors.filter((item) => item.departmentName === selectedFaculty)
  }, [majors, selectedFaculty])

  const filteredSemesters = useMemo(() => {
    const majorName = majors.find((item) => item.id === selectedMajorId)?.name
    if (!majorName) return []
    return semesters.filter((item) => item.majorName === majorName)
  }, [majors, semesters, selectedMajorId])

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const response = await fetch("/api/schedules/generate", { cache: "no-store" })
        const payload = await response.json()
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Không thể tải dữ liệu khoa/ngành/học kỳ")
        }

        setMajors(payload.data.majors || [])
        setSemesters(payload.data.semesters || [])
      } catch (error: any) {
        setErrorMessage(String(error?.message || "Lỗi khi tải dữ liệu ban đầu"))
      }
    }

    loadOptions()
  }, [])

  useEffect(() => {
    if (!jobId || status !== "running") return

    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/schedules/generate?jobId=${jobId}`, { cache: "no-store" })
        const payload = await response.json()

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Không lấy được tiến trình lập lịch")
        }

        const job: JobStatePayload = payload.data
        setProgress(Number(job.progress || 0))
        setSteps(job.steps || [])

        if (job.status === "completed") {
          setStatus("completed")

          const summaryLines: string[] = []
          if (job.result) {
            summaryLines.push(`Đã tạo ${job.result.createdRows} dòng lịch / ${job.result.totalTasks} tác vụ`)
            summaryLines.push(`Chưa phân được ${job.result.unassignedTasks} tác vụ`)
            if (Array.isArray(job.result.warnings)) {
              summaryLines.push(...job.result.warnings.slice(0, 3))
            }
          }

          setResultSummary(summaryLines)
          setJobId("")
          clearInterval(timer)
        }

        if (job.status === "error") {
          setStatus("error")
          setErrorMessage(job.error || "Lỗi khi lập lịch")
          setJobId("")
          clearInterval(timer)
        }
      } catch (error: any) {
        setStatus("error")
        setErrorMessage(String(error?.message || "Lỗi khi đồng bộ tiến trình"))
        setJobId("")
        clearInterval(timer)
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [jobId, status])

  const startGeneration = async () => {
    try {
      if (!selectedMajorId) {
        setStatus("error")
        setErrorMessage("Vui lòng chọn ngành trước khi lập lịch")
        return
      }

      setStatus("running")
      setProgress(0)
      setErrorMessage("")
      setResultSummary([])
      setSteps((prev) => prev.map((step) => ({ ...step, status: "pending", message: undefined })))

      const response = await fetch("/api/schedules/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          majorId: selectedMajorId,
          semesterIds: selectedSemesterId === "all" ? [] : [selectedSemesterId],
          settings,
          replaceExisting: true,
        }),
      })

      const payload = await response.json()

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Không thể khởi tạo tác vụ lập lịch")
      }

      setJobId(String(payload.data.jobId || ""))
    } catch (error: any) {
      setStatus("error")
      setErrorMessage(String(error?.message || "Lỗi khi bắt đầu lập lịch"))
    }
  }

  const resetGeneration = () => {
    setStatus("idle")
    setProgress(0)
    setJobId("")
    setErrorMessage("")
    setResultSummary([])
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
                  <Label>Học kỳ</Label>
                  <Select value={selectedSemesterId} onValueChange={setSelectedSemesterId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả học kỳ của ngành</SelectItem>
                      {filteredSemesters.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          HK {item.name} - Năm lớp {item.classYear || "?"}
                        </SelectItem>
                      ))}
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
                      {selectedFaculty || "Chọn khoa"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Tìm khoa..." />
                      <CommandEmpty>Không tìm thấy khoa.</CommandEmpty>
                      <CommandList>
                        <CommandGroup>
                          {faculties.map((faculty) => (
                            <CommandItem
                              key={faculty}
                              value={faculty}
                              onSelect={(currentValue) => {
                                setSelectedFaculty(currentValue === selectedFaculty ? "" : currentValue)
                                setSelectedMajorId("")
                                setSelectedSemesterId("all")
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
                        {majors.find((item) => item.id === selectedMajorId)?.name || "Chọn ngành"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Tìm ngành..." />
                        <CommandEmpty>Không tìm thấy ngành.</CommandEmpty>
                        <CommandList>
                          <CommandGroup>
                            {facultyMajors.map((major) => (
                              <CommandItem
                                key={major.id}
                                value={major.name}
                                onSelect={(currentValue) => {
                                  const nextMajorId = currentValue.toLowerCase() === major.name.toLowerCase() ? major.id : ""
                                  setSelectedMajorId(nextMajorId === selectedMajorId ? "" : nextMajorId)
                                  setSelectedSemesterId("all")
                                  setOpenMajorPopover(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedMajorId === major.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {major.name}
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

          {(errorMessage || resultSummary.length > 0) && (
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base">Kết quả thực thi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {errorMessage && <p className="text-destructive">{errorMessage}</p>}
                {resultSummary.map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
