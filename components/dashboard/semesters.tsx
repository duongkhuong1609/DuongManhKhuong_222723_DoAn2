"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import {
  CalendarDays,
  Plus,
  Search,
  Edit,
  Trash2,
  Check,
  ChevronsUpDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { cn } from "@/lib/utils"

interface SemesterItem {
  _id: string
  code: string
  name: string
  majorName: string
  classYear: number
  academicYear: string
  startDate: string
  endDate: string
  status: string
  mappedCourseCount: number
  mappedTotalCredits: number
}

interface MajorOption {
  id: string
  name: string
}

interface ClassOption {
  id: number
  name: string
  major: string
  year: number
  nienKhoa: string
}

interface SemesterCourseItem {
  id: number
  name: string
  type: string
  credits: number
  semester: string
}

interface SemesterEditState {
  id: string
  majorId: string
  majorName: string
  classYear: string
  semesterNumber: string
  academicYearStart: string
  startDate: string
  endDate: string
  status: "Đang diễn ra" | "Tạm ngưng"
}

const normalizeSemesterStatus = (value: unknown): "Đang diễn ra" | "Tạm ngưng" => {
  const normalized = String(value || "").trim().toLowerCase()
  if (
    normalized === "2" ||
    normalized === "đang diễn ra" ||
    normalized === "dang dien ra" ||
    normalized === "ongoing" ||
    normalized === "active"
  ) {
    return "Đang diễn ra"
  }
  if (
    normalized === "1" ||
    normalized === "tạm dừng" ||
    normalized === "tam dung" ||
    normalized === "tạm ngưng" ||
    normalized === "tam ngung" ||
    normalized === "paused"
  ) {
    return "Tạm ngưng"
  }
  return "Tạm ngưng"
}

const safeFetchJson = async (url: string, init?: RequestInit, retries = 1): Promise<any | null> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })

    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      return null
    }

    const json = await response.json()
    if (!response.ok || json?.success === false) {
      return null
    }

    return json
  } catch {
    if (retries > 0) {
      return safeFetchJson(url, init, retries - 1)
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const fetcher = async (url: string) => {
  const json = await safeFetchJson(url)
  return json?.data || []
}

const parseDateValue = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatDateOnly = (dateString: string) => {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return "-"

  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

const resolveMappedSemesterNumber = (classYear: number, semesterNumber: number) => {
  const mapping: Record<string, number> = {
    "1-1": 1,
    "1-2": 2,
    "2-1": 3,
    "2-2": 4,
    "3-1": 5,
    "3-2": 6,
    "3-3": 7,
    "4-1": 8,
    "4-2": 9,
    "4-3": 10,
  }

  return mapping[`${classYear}-${semesterNumber}`] || 0
}

const resolveDisplaySemesterName = (dbSemesterRaw: string, classYear: number) => {
  const dbSemester = Number(String(dbSemesterRaw || "").trim())
  if (Number.isNaN(dbSemester) || dbSemester <= 0) {
    return String(dbSemesterRaw || "").trim() || "-"
  }

  let semesterInYear = dbSemester
  if (classYear === 2) semesterInYear = dbSemester - 2
  if (classYear === 3) semesterInYear = dbSemester - 4
  if (classYear === 4) semesterInYear = dbSemester - 7

  if (semesterInYear <= 0) {
    return `Học kỳ ${dbSemester}`
  }

  return `Năm ${classYear} - Học kỳ ${semesterInYear}`
}

const resolveSemesterInYear = (dbSemesterRaw: string, classYear: number) => {
  const dbSemester = Number(String(dbSemesterRaw || "").trim())
  if (Number.isNaN(dbSemester) || dbSemester <= 0) return 1

  if (classYear === 1) return dbSemester
  if (classYear === 2) return dbSemester - 2
  if (classYear === 3) return dbSemester - 4
  if (classYear === 4) return dbSemester - 7
  return dbSemester
}

export function SemestersModule() {
  const currentYear = new Date().getFullYear()

  const { data: semesters = [], mutate } = useSWR<SemesterItem[]>("/api/semesters", fetcher)
  const [majors, setMajors] = useState<MajorOption[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEditSubmitting, setIsEditSubmitting] = useState(false)
  const [openMajorPopover, setOpenMajorPopover] = useState(false)
  const [openSemesterFilterPopover, setOpenSemesterFilterPopover] = useState(false)
  const [openMajorFilterPopover, setOpenMajorFilterPopover] = useState(false)
  const [selectedSemesterFilter, setSelectedSemesterFilter] = useState("all")
  const [selectedMajorFilter, setSelectedMajorFilter] = useState("all")
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("all")
  const [editingSemester, setEditingSemester] = useState<SemesterEditState | null>(null)
  const [coursesBySemester, setCoursesBySemester] = useState<Record<string, SemesterCourseItem[]>>({})
  const [loadingSemesterCoursesId, setLoadingSemesterCoursesId] = useState<string | null>(null)

  const [newSemester, setNewSemester] = useState({
    majorId: "",
    majorName: "",
    classYear: "1",
    semesterNumber: "1",
    academicYearStart: String(currentYear - 1),
    startDate: "",
    endDate: "",
    status: "Đang diễn ra" as "Đang diễn ra" | "Tạm ngưng",
  })

  const resetForm = () => {
    setNewSemester({
      majorId: "",
      majorName: "",
      classYear: "1",
      semesterNumber: "1",
      academicYearStart: String(currentYear - 1),
      startDate: "",
      endDate: "",
      status: "Đang diễn ra",
    })
    setOpenMajorPopover(false)
  }

  useEffect(() => {
    let active = true

    const loadInitialData = async () => {
      const [majorPayload, classPayload] = await Promise.all([
        safeFetchJson("/api/classes/options"),
        safeFetchJson("/api/classes"),
      ])

      if (!active) return

      const majorData = (majorPayload?.data?.majors || []).map((item: any) => ({
        id: String(item.id || "").trim(),
        name: String(item.name || "").trim(),
      }))
      setMajors(majorData)

      const classData = (classPayload?.data || []).map((item: any) => ({
        id: Number(item.id || 0),
        name: String(item.name || "").trim(),
        major: String(item.major || "").trim(),
        year: Number(item.year || 0),
        nienKhoa: String(item.nienKhoa || "").trim(),
      }))
      setClasses(classData)
    }

    loadInitialData()

    return () => {
      active = false
    }
  }, [])

  const classesAcademicYearStart = useMemo(() => {
    const counter = new Map<number, number>()

    for (const item of classes) {
      const startYear = Number((item.nienKhoa.split("-")[0] || "").trim())
      const classYear = Number(item.year)
      if (Number.isNaN(startYear) || Number.isNaN(classYear) || classYear <= 0) continue

      const derivedAcademicYearStart = startYear + classYear - 1
      counter.set(derivedAcademicYearStart, (counter.get(derivedAcademicYearStart) || 0) + 1)
    }

    if (counter.size === 0) return String(currentYear - 1)

    const ranked = Array.from(counter.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return b[0] - a[0]
    })

    return String(ranked[0][0])
  }, [classes, currentYear])

  useEffect(() => {
    setNewSemester((prev) => ({
      ...prev,
      academicYearStart: classesAcademicYearStart,
    }))
  }, [classesAcademicYearStart])

  const selectedMajorLabel = newSemester.majorName || "Chọn ngành học"
  const selectedClassYear = Number(newSemester.classYear)
  const selectedSemesterNumber = Number(newSemester.semesterNumber)
  const mappedSemesterNumber = resolveMappedSemesterNumber(selectedClassYear, selectedSemesterNumber)
  const maxSemesterInYear = selectedClassYear <= 2 ? 2 : 3
  const semesterOptions = Array.from({ length: maxSemesterInYear }, (_, index) => String(index + 1))

  useEffect(() => {
    if (!semesterOptions.includes(newSemester.semesterNumber)) {
      setNewSemester((prev) => ({ ...prev, semesterNumber: semesterOptions[0] }))
    }
  }, [newSemester.classYear])

  const classesInSelection = useMemo(() => {
    if (!newSemester.majorName) return []

    return classes
      .filter(
        (item) =>
          item.major === newSemester.majorName &&
          item.year === Number(newSemester.classYear)
      )
      .sort((a, b) => a.name.localeCompare(b.name, "vi"))
  }, [classes, newSemester.majorName, newSemester.classYear])

  const semesterFilterOptions = semesters.map((semester) => ({
    id: semester._id,
    label: `${resolveDisplaySemesterName(semester.name, Number(semester.classYear || 0))} - ${semester.majorName || "Chưa rõ ngành"}`,
  }))

  const majorFilterOptions = Array.from(
    new Set(
      semesters
        .map((semester) => String(semester.majorName || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "vi"))

  const filteredSemesters = semesters.filter((semester) => {
    const keyword = searchTerm.toLowerCase().trim()
    const displayName = resolveDisplaySemesterName(semester.name, Number(semester.classYear || 0)).toLowerCase()
    const majorName = String(semester.majorName || "").toLowerCase()

    const matchesKeyword = !keyword || displayName.includes(keyword) || majorName.includes(keyword)
    const matchesSemesterFilter = selectedSemesterFilter === "all" || semester._id === selectedSemesterFilter
    const matchesMajorFilter = selectedMajorFilter === "all" || String(semester.majorName || "") === selectedMajorFilter
    const matchesStatusFilter = selectedStatusFilter === "all" || String(semester.status || "") === selectedStatusFilter

    return matchesKeyword && matchesSemesterFilter && matchesMajorFilter && matchesStatusFilter
  })

  const loadSemesterCourses = async (semesterId?: string) => {
    const id = String(semesterId || "").trim()
    if (!id) return
    if (coursesBySemester[id]) return

    try {
      setLoadingSemesterCoursesId(id)
      const res = await fetch(`/api/semesters/courses?semesterId=${encodeURIComponent(id)}`)
      const json = await res.json()

      if (!res.ok || !json.success) {
        setCoursesBySemester((prev) => ({ ...prev, [id]: [] }))
        return
      }

      setCoursesBySemester((prev) => ({
        ...prev,
        [id]: json.data || [],
      }))
    } catch (error) {
      console.error("Error loading semester courses:", error)
      setCoursesBySemester((prev) => ({ ...prev, [id]: [] }))
    } finally {
      setLoadingSemesterCoursesId((prev) => (prev === id ? null : prev))
    }
  }

  const durationHint = maxSemesterInYear === 2
    ? "Năm này có 2 học kỳ: thời lượng mỗi kỳ phải từ 4-5 tháng"
    : "Năm này có 3 học kỳ: thời lượng mỗi kỳ phải từ 3-4 tháng"

  const handleAddSemester = async () => {
    if (isSubmitting) return

    if (!newSemester.majorId || !newSemester.majorName || !newSemester.classYear || !newSemester.semesterNumber || !newSemester.startDate || !newSemester.endDate) {
      alert("Vui lòng nhập đầy đủ thông tin học kỳ")
      return
    }

    const startDate = parseDateValue(newSemester.startDate)
    const endDate = parseDateValue(newSemester.endDate)

    if (!startDate || !endDate) {
      alert("Mốc thời gian không hợp lệ")
      return
    }

    if (startDate >= endDate) {
      alert("Ngày bắt đầu phải nhỏ hơn ngày kết thúc")
      return
    }

    const academicYearStart = Number(newSemester.academicYearStart)
    const startYear = startDate.getFullYear()
    const endYear = endDate.getFullYear()
    if (
      startYear < academicYearStart ||
      startYear > academicYearStart + 1 ||
      endYear < academicYearStart ||
      endYear > academicYearStart + 1
    ) {
      alert(`Thời gian chỉ được nằm trong năm học ${academicYearStart}-${academicYearStart + 1}`)
      return
    }

    const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    const minDays = maxSemesterInYear === 2 ? 120 : 90
    const maxDays = maxSemesterInYear === 2 ? 155 : 124
    if (durationDays < minDays || durationDays > maxDays) {
      alert(maxSemesterInYear === 2
        ? "Năm 1-2 phải có thời lượng học kỳ từ 4-5 tháng"
        : "Năm 3-4 phải có thời lượng học kỳ từ 3-4 tháng")
      return
    }

    const shouldCreate = confirm(
      `Xác nhận thêm học kỳ:\n- Ngành: ${newSemester.majorName}\n- Năm lớp: Năm ${newSemester.classYear}\n- Học kỳ đã chọn: ${newSemester.semesterNumber}\n- Quy đổi CSDL: Học kỳ ${mappedSemesterNumber}\n- Năm học: ${academicYearStart}-${academicYearStart + 1}\n- Số lớp hiện có: ${classesInSelection.length}`
    )
    if (!shouldCreate) return

    try {
      setIsSubmitting(true)
      const res = await fetch("/api/semesters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          majorId: newSemester.majorId,
          majorName: newSemester.majorName,
          classYear: Number(newSemester.classYear),
          semesterNumber: Number(newSemester.semesterNumber),
          academicYearStart,
          startDate: newSemester.startDate,
          endDate: newSemester.endDate,
          status: newSemester.status,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || "Thêm học kỳ thất bại")
        return
      }

      if (json.data?.alreadyExists) {
        alert("Học kỳ đã tồn tại, hệ thống giữ nguyên dữ liệu hiện có")
      } else if (json.data?.recovered) {
        alert("Học kỳ đã được tạo thành công")
      } else if (json.data?.warning) {
        alert(String(json.data.warning))
      } else {
        alert("Thêm học kỳ thành công")
      }
      setIsAddDialogOpen(false)
      resetForm()
      mutate()
    } catch (error) {
      console.error("Error adding semester:", error)
      alert("Lỗi khi thêm học kỳ")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateStatus = async (semester: SemesterItem, status: string) => {
    try {
      const res = await fetch("/api/semesters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: semester._id, status }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || "Cập nhật trạng thái thất bại")
        return
      }

      mutate()
    } catch (error) {
      console.error("Error updating semester status:", error)
      alert("Lỗi khi cập nhật trạng thái học kỳ")
    }
  }

  const openEditSemesterDialog = (semester: SemesterItem) => {
    const classYear = Number(semester.classYear || 1) || 1
    const semesterInYear = Math.max(1, resolveSemesterInYear(semester.name, classYear))
    const startYearFromAcademicYear = Number((String(semester.academicYear || "").split("-")[0] || "").trim())
    const startYear = Number.isNaN(startYearFromAcademicYear)
      ? Number(classesAcademicYearStart)
      : startYearFromAcademicYear

    const majorId = majors.find((major) => major.name === semester.majorName)?.id || ""

    setEditingSemester({
      id: semester._id,
      majorId,
      majorName: semester.majorName || "",
      classYear: String(classYear),
      semesterNumber: String(semesterInYear),
      academicYearStart: String(startYear),
      startDate: String(semester.startDate || "").slice(0, 10),
      endDate: String(semester.endDate || "").slice(0, 10),
      status: normalizeSemesterStatus(semester.status),
    })
    setIsEditDialogOpen(true)
  }

  const handleUpdateSemester = async () => {
    if (!editingSemester || isEditSubmitting) return

    if (!editingSemester.majorId || !editingSemester.majorName || !editingSemester.classYear || !editingSemester.semesterNumber || !editingSemester.startDate || !editingSemester.endDate) {
      alert("Vui lòng nhập đầy đủ thông tin học kỳ")
      return
    }

    const startDate = parseDateValue(editingSemester.startDate)
    const endDate = parseDateValue(editingSemester.endDate)
    if (!startDate || !endDate || startDate >= endDate) {
      alert("Mốc thời gian không hợp lệ")
      return
    }

    try {
      setIsEditSubmitting(true)
      const res = await fetch("/api/semesters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateInfo",
          _id: editingSemester.id,
          majorId: editingSemester.majorId,
          majorName: editingSemester.majorName,
          classYear: Number(editingSemester.classYear),
          semesterNumber: Number(editingSemester.semesterNumber),
          academicYearStart: Number(editingSemester.academicYearStart),
          startDate: editingSemester.startDate,
          endDate: editingSemester.endDate,
          status: editingSemester.status,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || "Cập nhật học kỳ thất bại")
        return
      }

      alert("Cập nhật học kỳ thành công")
      setIsEditDialogOpen(false)
      setEditingSemester(null)
      mutate()
    } catch (error) {
      console.error("Error updating semester info:", error)
      alert("Lỗi khi cập nhật học kỳ")
    } finally {
      setIsEditSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa học kỳ này?")) return

    try {
      const res = await fetch(`/api/semesters?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || "Xóa học kỳ thất bại")
        return
      }

      if (json.data?.alreadyDeleted) {
        alert("Học kỳ đã được xóa trước đó")
      } else if (json.data?.recovered) {
        alert("Xóa học kỳ thành công")
      }

      mutate()
    } catch (error) {
      console.error("Error deleting semester:", error)
      alert("Lỗi khi xóa học kỳ")
    }
  }

  const getStatusBadge = (status: string) => {
    const normalized = normalizeSemesterStatus(status)
    if (normalized === "Đang diễn ra") {
      return <Badge className="bg-green-100 text-green-700">Đang diễn ra</Badge>
    }
    return <Badge variant="secondary">Tạm ngưng</Badge>
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Quản lý Học kỳ
              </CardTitle>
              <CardDescription>Thêm học kỳ theo ngành, năm lớp, mốc thời gian và tự liên kết môn học</CardDescription>
            </div>
            <Dialog
              open={isAddDialogOpen}
              onOpenChange={(open) => {
                setIsAddDialogOpen(open)
                if (!open) resetForm()
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Thêm học kỳ
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[620px]">
                <DialogHeader>
                  <DialogTitle>Thêm học kỳ mới</DialogTitle>
                  <DialogDescription>
                    Chọn ngành học, năm lớp, học kỳ và mốc thời gian theo đúng quy định của năm học.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Ngành học</Label>
                    <Popover open={openMajorPopover} onOpenChange={setOpenMajorPopover}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openMajorPopover}
                          className="w-full justify-between"
                          title={selectedMajorLabel}
                        >
                          <span className="min-w-0 flex-1 truncate text-left">{selectedMajorLabel}</span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Tìm kiếm ngành học..." />
                          <CommandList>
                            <CommandEmpty>Không tìm thấy ngành học.</CommandEmpty>
                            <CommandGroup>
                              {majors.map((major) => (
                                <CommandItem
                                  key={major.id}
                                  value={major.name}
                                  onSelect={() => {
                                    setNewSemester((prev) => ({
                                      ...prev,
                                      majorId: major.id,
                                      majorName: major.name,
                                    }))
                                    setOpenMajorPopover(false)
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      newSemester.majorId === major.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <span className="min-w-0 flex-1 truncate" title={major.name}>{major.name}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Năm lớp</Label>
                      <Select
                        value={newSemester.classYear}
                        onValueChange={(value) => setNewSemester((prev) => ({ ...prev, classYear: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn năm lớp" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Năm 1</SelectItem>
                          <SelectItem value="2">Năm 2</SelectItem>
                          <SelectItem value="3">Năm 3</SelectItem>
                          <SelectItem value="4">Năm 4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Học kỳ</Label>
                      <Select
                        value={newSemester.semesterNumber}
                        onValueChange={(value) => setNewSemester((prev) => ({ ...prev, semesterNumber: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn học kỳ" />
                        </SelectTrigger>
                        <SelectContent>
                          {semesterOptions.map((option) => (
                            <SelectItem key={option} value={option}>{`Học kỳ ${option}`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Năm học hiện tại</Label>
                      <Input
                        value={`${newSemester.academicYearStart}-${Number(newSemester.academicYearStart) + 1}`}
                        disabled
                        readOnly
                      />
                    </div>
                  </div>

                  <div className="rounded-md border border-dashed p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Danh sách lớp theo ngành và năm đã chọn</p>
                      <Badge variant="secondary">{`Số lớp: ${classesInSelection.length}`}</Badge>
                    </div>
                    {classesInSelection.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Chưa có lớp phù hợp với ngành/năm đã chọn.</p>
                    ) : (
                      <div className="max-h-24 overflow-y-auto text-sm text-muted-foreground">
                        {classesInSelection.map((item) => item.name).join(", ")}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Từ ngày</Label>
                      <Input
                        type="date"
                        value={newSemester.startDate}
                        onChange={(e) => setNewSemester((prev) => ({ ...prev, startDate: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Đến ngày</Label>
                      <Input
                        type="date"
                        value={newSemester.endDate}
                        onChange={(e) => setNewSemester((prev) => ({ ...prev, endDate: e.target.value }))}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">{durationHint}</p>
                  <p className="text-xs text-muted-foreground">
                    {mappedSemesterNumber > 0
                      ? `Quy đổi khi lưu: Năm ${selectedClassYear} - Học kỳ ${selectedSemesterNumber} => Học kỳ ${mappedSemesterNumber} trong CSDL`
                      : "Không thể quy đổi học kỳ với lựa chọn hiện tại"}
                  </p>

                  <div className="space-y-2">
                    <Label>Trạng thái</Label>
                    <Select
                      value={newSemester.status}
                      onValueChange={(value: "Đang diễn ra" | "Tạm ngưng") =>
                        setNewSemester((prev) => ({ ...prev, status: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn trạng thái" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Đang diễn ra">Đang diễn ra</SelectItem>
                        <SelectItem value="Tạm ngưng">Tạm ngưng</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Hủy
                  </Button>
                  <Button onClick={handleAddSemester} disabled={isSubmitting}>
                    {isSubmitting ? "Đang thêm..." : "Thêm học kỳ"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm theo tên học kỳ hoặc tên ngành..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Popover open={openSemesterFilterPopover} onOpenChange={setOpenSemesterFilterPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openSemesterFilterPopover}
                  className="w-[280px] justify-between"
                >
                  <span className="min-w-0 flex-1 truncate text-left">
                    {selectedSemesterFilter === "all"
                      ? "Lọc học kỳ"
                      : semesterFilterOptions.find((item) => item.id === selectedSemesterFilter)?.label || "Lọc học kỳ"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Tra cứu học kỳ..." />
                  <CommandList>
                    <CommandEmpty>Không tìm thấy học kỳ.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="all"
                        onSelect={() => {
                          setSelectedSemesterFilter("all")
                          setOpenSemesterFilterPopover(false)
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", selectedSemesterFilter === "all" ? "opacity-100" : "opacity-0")} />
                        Tất cả học kỳ
                      </CommandItem>
                      {semesterFilterOptions.map((option) => (
                        <CommandItem
                          key={option.id}
                          value={option.label}
                          onSelect={() => {
                            setSelectedSemesterFilter(option.id)
                            setOpenSemesterFilterPopover(false)
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedSemesterFilter === option.id ? "opacity-100" : "opacity-0")} />
                          <span className="min-w-0 flex-1 truncate" title={option.label}>{option.label}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Popover open={openMajorFilterPopover} onOpenChange={setOpenMajorFilterPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openMajorFilterPopover}
                  className="w-[220px] justify-between"
                >
                  <span className="min-w-0 flex-1 truncate text-left">
                    {selectedMajorFilter === "all" ? "Lọc theo ngành" : selectedMajorFilter}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Tra cứu ngành..." />
                  <CommandList>
                    <CommandEmpty>Không tìm thấy ngành.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="all"
                        onSelect={() => {
                          setSelectedMajorFilter("all")
                          setOpenMajorFilterPopover(false)
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", selectedMajorFilter === "all" ? "opacity-100" : "opacity-0")} />
                        Tất cả ngành
                      </CommandItem>
                      {majorFilterOptions.map((major) => (
                        <CommandItem
                          key={major}
                          value={major}
                          onSelect={() => {
                            setSelectedMajorFilter(major)
                            setOpenMajorFilterPopover(false)
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedMajorFilter === major ? "opacity-100" : "opacity-0")} />
                          <span className="min-w-0 flex-1 truncate" title={major}>{major}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Select value={selectedStatusFilter} onValueChange={setSelectedStatusFilter}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Lọc theo trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                <SelectItem value="Đang diễn ra">Đang diễn ra</SelectItem>
                <SelectItem value="Tạm ngưng">Tạm ngưng</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên học kỳ</TableHead>
                  <TableHead>Ngành</TableHead>
                  <TableHead>Năm học</TableHead>
                  <TableHead>Từ ngày</TableHead>
                  <TableHead>Đến ngày</TableHead>
                  <TableHead>Tổng môn</TableHead>
                  <TableHead>Tổng tín chỉ</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSemesters.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Chưa có học kỳ nào.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSemesters.map((semester) => (
                    <TableRow key={semester._id}>
                      <TableCell
                        className="font-medium"
                        title={`CSDL: Học kỳ ${semester.name}`}
                      >
                        {resolveDisplaySemesterName(semester.name, Number(semester.classYear || 0))}
                      </TableCell>
                      <TableCell>{semester.majorName || "-"}</TableCell>
                      <TableCell>{semester.academicYear || "-"}</TableCell>
                      <TableCell>{formatDateOnly(semester.startDate)}</TableCell>
                      <TableCell>{formatDateOnly(semester.endDate)}</TableCell>
                      <TableCell>
                        <HoverCard openDelay={120} closeDelay={120}>
                          <HoverCardTrigger asChild>
                            <button
                              type="button"
                              className="text-left hover:underline"
                              onMouseEnter={() => loadSemesterCourses(semester._id)}
                              onFocus={() => loadSemesterCourses(semester._id)}
                              onClick={() => loadSemesterCourses(semester._id)}
                            >
                              {semester.mappedCourseCount || 0}
                            </button>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-[380px]">
                            <div className="space-y-2">
                              <p className="text-sm font-semibold">Môn học trong học kỳ</p>
                              {loadingSemesterCoursesId === semester._id ? (
                                <p className="text-sm text-muted-foreground">Đang tải dữ liệu...</p>
                              ) : (coursesBySemester[semester._id] || []).length === 0 ? (
                                <p className="text-sm text-muted-foreground">Chưa có môn học trong học kỳ này.</p>
                              ) : (
                                <div className="space-y-2 max-h-56 overflow-y-auto">
                                  {(coursesBySemester[semester._id] || []).map((course) => (
                                    <div key={`${semester._id}-${course.id}`} className="rounded-md border p-2">
                                      <p className="text-sm font-medium">{course.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {course.type || "Chưa rõ loại"} • {course.credits} tín chỉ • HK {course.semester || "-"}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      </TableCell>
                      <TableCell>{semester.mappedTotalCredits || 0}</TableCell>
                      <TableCell>{getStatusBadge(semester.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditSemesterDialog(semester)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(semester._id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open)
          if (!open) setEditingSemester(null)
        }}
      >
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Sửa học kỳ</DialogTitle>
            <DialogDescription>Cập nhật thông tin học kỳ</DialogDescription>
          </DialogHeader>

          {editingSemester ? (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Ngành học</Label>
                <Select
                  value={editingSemester.majorId}
                  onValueChange={(value) => {
                    const majorName = majors.find((major) => major.id === value)?.name || ""
                    setEditingSemester((prev) => prev ? { ...prev, majorId: value, majorName } : prev)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn ngành học" />
                  </SelectTrigger>
                  <SelectContent>
                    {majors.map((major) => (
                      <SelectItem key={major.id} value={major.id}>{major.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Năm lớp</Label>
                  <Select
                    value={editingSemester.classYear}
                    onValueChange={(value) => {
                      const maxSemester = Number(value) <= 2 ? 2 : 3
                      const normalizedSemester = Math.min(Number(editingSemester.semesterNumber), maxSemester)
                      setEditingSemester((prev) => prev ? {
                        ...prev,
                        classYear: value,
                        semesterNumber: String(normalizedSemester),
                      } : prev)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn năm lớp" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Năm 1</SelectItem>
                      <SelectItem value="2">Năm 2</SelectItem>
                      <SelectItem value="3">Năm 3</SelectItem>
                      <SelectItem value="4">Năm 4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Học kỳ</Label>
                  <Select
                    value={editingSemester.semesterNumber}
                    onValueChange={(value) => setEditingSemester((prev) => prev ? { ...prev, semesterNumber: value } : prev)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn học kỳ" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Number(editingSemester.classYear) <= 2 ? [1, 2] : [1, 2, 3]).map((option) => (
                        <SelectItem key={option} value={String(option)}>{`Học kỳ ${option}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Năm học</Label>
                  <Input
                    value={`${editingSemester.academicYearStart}-${Number(editingSemester.academicYearStart) + 1}`}
                    readOnly
                    disabled
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Từ ngày</Label>
                  <Input
                    type="date"
                    value={editingSemester.startDate}
                    onChange={(e) => setEditingSemester((prev) => prev ? { ...prev, startDate: e.target.value } : prev)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Đến ngày</Label>
                  <Input
                    type="date"
                    value={editingSemester.endDate}
                    onChange={(e) => setEditingSemester((prev) => prev ? { ...prev, endDate: e.target.value } : prev)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Trạng thái</Label>
                <Select
                  value={editingSemester.status}
                  onValueChange={(value: "Đang diễn ra" | "Tạm ngưng") =>
                    setEditingSemester((prev) => prev ? { ...prev, status: value } : prev)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Đang diễn ra">Đang diễn ra</SelectItem>
                    <SelectItem value="Tạm ngưng">Tạm ngưng</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleUpdateSemester} disabled={isEditSubmitting}>
              {isEditSubmitting ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
