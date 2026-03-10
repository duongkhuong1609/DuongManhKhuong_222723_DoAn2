"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface PreferenceInstructorSummary {
  maGV: string
  tenGV: string
  emailGV: string
  department: string
  timeCount: number
  otherCount: number
}

interface TimePreferenceItem {
  id: number
  thuTrongTuan: string
  tietDay: string
  mucDoUuTien: string
}

interface OtherPreferenceItem {
  id: number
  tenNV: string
  giaTri: string
}

export function InstructorPreferencesModule() {
  const [preferenceInstructors, setPreferenceInstructors] = useState<PreferenceInstructorSummary[]>([])
  const [selectedPreferenceInstructor, setSelectedPreferenceInstructor] = useState<string>("")
  const [timePreferences, setTimePreferences] = useState<TimePreferenceItem[]>([])
  const [otherPreferences, setOtherPreferences] = useState<OtherPreferenceItem[]>([])
  const [loadingPreferenceInstructors, setLoadingPreferenceInstructors] = useState(false)
  const [loadingPreferenceDetails, setLoadingPreferenceDetails] = useState(false)
  const [priorityDraftById, setPriorityDraftById] = useState<Record<number, string>>({})
  const [searchInstructorName, setSearchInstructorName] = useState("")
  const [selectedDepartment, setSelectedDepartment] = useState("all")

  const loadPreferenceDetails = async (maGV: string) => {
    const code = String(maGV || "").trim()
    if (!code) return

    try {
      setLoadingPreferenceDetails(true)
      const res = await fetch(`/api/instructors/preferences?maGV=${encodeURIComponent(code)}`)
      const json = await res.json()

      if (!res.ok || !json.success) {
        setTimePreferences([])
        setOtherPreferences([])
        setPriorityDraftById({})
        return
      }

      const nextTime = (json.data?.timePreferences || []) as TimePreferenceItem[]
      const nextOther = (json.data?.otherPreferences || []) as OtherPreferenceItem[]
      setTimePreferences(nextTime)
      setOtherPreferences(nextOther)
      setPriorityDraftById(
        nextTime.reduce((acc, item) => {
          acc[item.id] = String(item.mucDoUuTien || "")
          return acc
        }, {} as Record<number, string>)
      )
    } catch (error) {
      console.error("Error loading preference details:", error)
      setTimePreferences([])
      setOtherPreferences([])
      setPriorityDraftById({})
    } finally {
      setLoadingPreferenceDetails(false)
    }
  }

  const loadPreferenceInstructors = async () => {
    try {
      setLoadingPreferenceInstructors(true)
      const res = await fetch("/api/instructors/preferences")
      const json = await res.json()

      if (!res.ok || !json.success) {
        setPreferenceInstructors([])
        return
      }

      const list = (json.data || []) as PreferenceInstructorSummary[]
      setPreferenceInstructors(list)

      if (list.length === 0) {
        setSelectedPreferenceInstructor("")
        setTimePreferences([])
        setOtherPreferences([])
        setPriorityDraftById({})
        return
      }

      const stillExists = list.some((item) => item.maGV === selectedPreferenceInstructor)
      const nextSelected = stillExists ? selectedPreferenceInstructor : list[0].maGV
      setSelectedPreferenceInstructor(nextSelected)
      await loadPreferenceDetails(nextSelected)
    } catch (error) {
      console.error("Error loading preference instructors:", error)
      setPreferenceInstructors([])
    } finally {
      setLoadingPreferenceInstructors(false)
    }
  }

  const handleUpdateTimePriority = async (preferenceId: number) => {
    if (!selectedPreferenceInstructor || !Number.isFinite(preferenceId)) return

    try {
      const mucDoUuTien = String(priorityDraftById[preferenceId] || "").trim()
      const priority = Number(mucDoUuTien)

      if (!Number.isInteger(priority) || priority < 1 || priority > 3) {
        alert("Mức độ ưu tiên chỉ được nhập 1, 2 hoặc 3")
        return
      }

      const res = await fetch("/api/instructors/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maGV: selectedPreferenceInstructor,
          preferenceId,
          mucDoUuTien: priority,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || "Không thể cập nhật mức độ ưu tiên")
        return
      }

      await loadPreferenceDetails(selectedPreferenceInstructor)
      alert("Cập nhật mức độ ưu tiên thành công")
    } catch (error) {
      console.error("Error updating time priority:", error)
      alert("Lỗi khi cập nhật mức độ ưu tiên")
    }
  }

  useEffect(() => {
    loadPreferenceInstructors()
  }, [])

  const departmentOptions = Array.from(
    new Set(preferenceInstructors.map((item) => String(item.department || "").trim()).filter(Boolean))
  )

  const visiblePreferenceInstructors = preferenceInstructors.filter((item) => {
    const matchesName = String(item.tenGV || "").toLowerCase().includes(searchInstructorName.toLowerCase())
    const matchesDepartment = selectedDepartment === "all" || item.department === selectedDepartment
    return matchesName && matchesDepartment
  })

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Quản lý nguyện vọng giảng viên</h2>
        <p className="text-muted-foreground">
          Theo dõi giảng viên có nguyện vọng, cập nhật mức độ ưu tiên nguyện vọng thời gian và xem nguyện vọng đặc biệt.
        </p>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Danh sách nguyện vọng</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_240px]">
            <Input
              placeholder="Tìm kiếm theo tên giảng viên..."
              value={searchInstructorName}
              onChange={(event) => setSearchInstructorName(event.target.value)}
            />
            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger>
                <SelectValue placeholder="Lọc theo khoa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả khoa</SelectItem>
                {departmentOptions.map((dep) => (
                  <SelectItem key={dep} value={dep}>
                    {dep}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="rounded-lg border">
              <div className="border-b px-4 py-3 font-medium">Giảng viên có nguyện vọng</div>
              <div className="max-h-[420px] overflow-auto p-2 space-y-2">
                {loadingPreferenceInstructors ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Đang tải danh sách...</p>
                ) : visiblePreferenceInstructors.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Không có giảng viên phù hợp bộ lọc.</p>
                ) : (
                  visiblePreferenceInstructors.map((item) => (
                    <button
                      key={item.maGV}
                      type="button"
                      className={cn(
                        "w-full rounded-md border px-3 py-2 text-left transition-colors",
                        selectedPreferenceInstructor === item.maGV ? "border-primary bg-primary/10" : "hover:bg-muted/40"
                      )}
                      onClick={() => {
                        setSelectedPreferenceInstructor(item.maGV)
                        loadPreferenceDetails(item.maGV)
                      }}
                    >
                      <p className="font-medium">{item.tenGV}</p>
                      <p className="text-xs text-muted-foreground">{item.emailGV}</p>
                      <p className="text-xs text-muted-foreground">{item.department || "Chưa có khoa"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Thời gian: {item.timeCount} • Đặc biệt: {item.otherCount}</p>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h3 className="mb-3 font-medium">Nguyện vọng thời gian (admin điều chỉnh ưu tiên)</h3>
                {loadingPreferenceDetails ? (
                  <p className="text-sm text-muted-foreground">Đang tải chi tiết...</p>
                ) : timePreferences.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Giảng viên chưa có nguyện vọng thời gian.</p>
                ) : (
                  <div className="space-y-3">
                    {timePreferences.map((item) => (
                      <div key={item.id} className="rounded-md border p-3">
                        <p className="text-sm font-medium">{item.thuTrongTuan} • {item.tietDay}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={3}
                            step={1}
                            value={priorityDraftById[item.id] || ""}
                            onChange={(event) =>
                              setPriorityDraftById((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                            placeholder="Nhập 1, 2 hoặc 3"
                            className="max-w-[220px]"
                          />
                          <Button size="sm" onClick={() => handleUpdateTimePriority(item.id)}>
                            Lưu
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border p-4">
                <h3 className="mb-3 font-medium">Nguyện vọng đặc biệt (chỉ xem)</h3>
                {loadingPreferenceDetails ? (
                  <p className="text-sm text-muted-foreground">Đang tải chi tiết...</p>
                ) : otherPreferences.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Giảng viên chưa có nguyện vọng đặc biệt.</p>
                ) : (
                  <div className="space-y-2">
                    {otherPreferences.map((item) => (
                      <div key={item.id} className="rounded-md border p-3">
                        <p className="font-medium">{item.tenNV}</p>
                        <p className="text-sm text-muted-foreground">Mức độ ưu tiên: {item.giaTri}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
