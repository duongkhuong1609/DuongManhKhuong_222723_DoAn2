"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Edit, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"

const initialInstructors: any[] = []

const POSITION_OPTIONS = ["Thạc sĩ", "Tiến sĩ", "Phó Giáo sư", "Giáo sư"]

const normalizeText = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

const normalizePositionValue = (value: string) => {
  const cleaned = normalizeText(value)
  if (!cleaned) return ""

  if (cleaned.includes("thac si") || cleaned.includes("ths")) return "Thạc sĩ"
  if (cleaned.includes("tien si") || cleaned.includes("ts")) return "Tiến sĩ"
  if (cleaned.includes("pho giao su") || cleaned.includes("pgs")) return "Phó Giáo sư"
  if (cleaned.includes("giao su") || cleaned === "gs") return "Giáo sư"

  return String(value || "").trim()
}

interface Instructor {
  id?: number // only used locally for added entries
  code?: string
  name: string
  email: string
  position: string
  department: string
  status: string
}

interface InstructorCourse {
  id: number
  name: string
  type: string
  year: string
  semester: string
  credits: number
  majorId?: string
  majorName?: string
}

interface MajorOption {
  id: string
  name: string
  department: string
}

interface CourseOption {
  id: number
  name: string
  type: string
  majorId: string
  majorName: string
  year: number
  semester: number
}

interface InstructorFormState {
  name: string
  email: string
  position: string
  department: string
  status: string
  majorId: string
  responsibleCourseIds: number[]
}

interface PreferenceInstructorSummary {
  maGV: string
  tenGV: string
  emailGV: string
  timeCount: number
  otherCount: number
  pendingOtherCount?: number
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
  trangThaiDuyet: string
}

const getApprovalTextColor = (status: string) => {
  if (status === "Đã duyệt") return "text-emerald-700"
  return "text-red-600"
}

const getApprovalBadgeClassName = (status: string) => {
  if (status === "Đã duyệt") return "bg-emerald-100 text-emerald-700 border-emerald-300"
  if (status === "Không duyệt") return "bg-red-100 text-red-700 border-red-300"
  return "bg-red-100 text-red-700 border-red-300"
}

interface InstructorsModuleProps {
  showPreferencesForm?: boolean
}

export function InstructorsModule({ showPreferencesForm = false }: InstructorsModuleProps) {
  const [instructors, setInstructors] = useState(initialInstructors)
  const [departments, setDepartments] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState("")
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("")
  const [openDepartmentFilterPopover, setOpenDepartmentFilterPopover] = useState(false)
  const [openAddDepartmentPopover, setOpenAddDepartmentPopover] = useState(false)
  const [openAddCoursePopover, setOpenAddCoursePopover] = useState(false)
  const [openEditCoursePopover, setOpenEditCoursePopover] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [coursesByInstructor, setCoursesByInstructor] = useState<Record<string, InstructorCourse[]>>({})
  const [loadingInstructorCoursesCode, setLoadingInstructorCoursesCode] = useState<string | null>(null)
  const [preferenceInstructors, setPreferenceInstructors] = useState<PreferenceInstructorSummary[]>([])
  const [selectedPreferenceInstructor, setSelectedPreferenceInstructor] = useState<string>("")
  const [timePreferences, setTimePreferences] = useState<TimePreferenceItem[]>([])
  const [otherPreferences, setOtherPreferences] = useState<OtherPreferenceItem[]>([])
  const [loadingPreferenceInstructors, setLoadingPreferenceInstructors] = useState(false)
  const [loadingPreferenceDetails, setLoadingPreferenceDetails] = useState(false)
  const [priorityDraftById, setPriorityDraftById] = useState<Record<number, string>>({})
  const [addMajorOptions, setAddMajorOptions] = useState<MajorOption[]>([])
  const [editMajorOptions, setEditMajorOptions] = useState<MajorOption[]>([])
  const [addCourseOptions, setAddCourseOptions] = useState<CourseOption[]>([])
  const [editCourseOptions, setEditCourseOptions] = useState<CourseOption[]>([])

  const loadInstructors = () => {
    fetch('/api/instructors')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setInstructors(json.data || [])
          if (!json.data || json.data.length === 0) {
            setLoadError('Không thể tải dữ liệu giảng viên. Kiểm tra kết nối cơ sở dữ liệu.')
          } else {
            setLoadError(null)
          }
        } else {
          setLoadError(json.error || 'Lỗi không xác định khi tải giảng viên')
        }
      })
      .catch(err => {
        console.error('Error loading instructors:', err)
        setLoadError(err.message || 'Lỗi khi gọi API')
      })
  }

  const loadPreferenceInstructors = async () => {
    try {
      setLoadingPreferenceInstructors(true)
      const res = await fetch('/api/instructors/preferences')
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
      console.error('Error loading preference instructors:', error)
      setPreferenceInstructors([])
    } finally {
      setLoadingPreferenceInstructors(false)
    }
  }

  const loadPreferenceDetails = async (maGV: string) => {
    const code = String(maGV || '').trim()
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
          acc[item.id] = String(item.mucDoUuTien || '')
          return acc
        }, {} as Record<number, string>)
      )
    } catch (error) {
      console.error('Error loading preference details:', error)
      setTimePreferences([])
      setOtherPreferences([])
      setPriorityDraftById({})
    } finally {
      setLoadingPreferenceDetails(false)
    }
  }

  const handleUpdateTimePriority = async (preferenceId: number) => {
    if (!selectedPreferenceInstructor || !Number.isFinite(preferenceId)) return

    try {
      const mucDoUuTien = String(priorityDraftById[preferenceId] || '').trim()

      const res = await fetch('/api/instructors/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maGV: selectedPreferenceInstructor,
          preferenceId,
          mucDoUuTien,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Không thể cập nhật mức độ ưu tiên')
        return
      }

      await loadPreferenceDetails(selectedPreferenceInstructor)
      alert('Cập nhật mức độ ưu tiên thành công')
    } catch (error) {
      console.error('Error updating time priority:', error)
      alert('Lỗi khi cập nhật mức độ ưu tiên')
    }
  }

  const handleUpdateOtherApproval = async (preferenceId: number, trangThaiDuyet: "Đã duyệt" | "Không duyệt") => {
    if (!selectedPreferenceInstructor || !Number.isFinite(preferenceId)) return

    try {
      const res = await fetch('/api/instructors/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'other',
          maGV: selectedPreferenceInstructor,
          preferenceId,
          trangThaiDuyet,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Không thể cập nhật trạng thái duyệt')
        return
      }

      await loadPreferenceDetails(selectedPreferenceInstructor)
      await loadPreferenceInstructors()
      alert(`Đã cập nhật trạng thái: ${trangThaiDuyet}`)
    } catch (error) {
      console.error('Error updating approval status:', error)
      alert('Lỗi khi cập nhật trạng thái duyệt')
    }
  }

  // fetch instructors from API once when component mounts
  useEffect(() => {
    loadInstructors()
    if (showPreferencesForm) {
      loadPreferenceInstructors()
    }

    fetch('/api/departments')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setDepartments(json.data || [])
        }
      })
      .catch(err => {
        console.error('Error loading departments:', err)
      })
  }, [showPreferencesForm])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [selectedInstructor, setSelectedInstructor] = useState<Instructor | null>(null)
  const [newInstructor, setNewInstructor] = useState<InstructorFormState>({
    name: "",
    email: "",
    department: "",
    position: "",
    status: "",
    majorId: "",
    responsibleCourseIds: [],
  })

  const resetAddForm = () => {
    setNewInstructor({
      name: "",
      email: "",
      department: "",
      position: "",
      status: "",
      majorId: "",
      responsibleCourseIds: [],
    })
    setOpenAddDepartmentPopover(false)
    setOpenAddCoursePopover(false)
    setAddMajorOptions([])
    setAddCourseOptions([])
  }

  const getInstructorKey = (instructor: Instructor) =>
    instructor.code ? `code-${instructor.code}` : `id-${instructor.id}`

  const filteredInstructors = instructors.filter(
    (instructor) =>
      instructor.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instructor.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instructor.position?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const visibleInstructors = filteredInstructors.filter(
    (instructor) =>
      (selectedDepartmentFilter === "" || instructor.department === selectedDepartmentFilter) &&
      (selectedStatusFilter === "" || instructor.status === selectedStatusFilter)
  )

  const departmentOptions = departments.length
    ? departments
    : (Array.from(new Set(instructors.map(i => i.department).filter(Boolean))) as string[])

  const sortedVisibleInstructors = [...visibleInstructors].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "vi", { sensitivity: "base" })
  )

  const totalInstructorCount = instructors.length
  const visibleInstructorCount = sortedVisibleInstructors.length

  const handleAddInstructor = async () => {
    if (!newInstructor.name || !newInstructor.email || !newInstructor.department || !newInstructor.position || !newInstructor.status) {
      alert('Vui lòng nhập đầy đủ thông tin bắt buộc')
      return
    }

    try {
      const res = await fetch('/api/instructors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newInstructor.name,
          email: newInstructor.email,
          position: newInstructor.position,
          status: newInstructor.status,
          department: newInstructor.department,
          majorId: newInstructor.majorId,
          responsibleCourseIds: newInstructor.responsibleCourseIds,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Thêm giảng viên thất bại')
        return
      }

      const account = json.data?.account
      if (account?.username && account?.password) {
        alert(
          `Thêm giảng viên thành công.\n` +
            `Đã tạo tài khoản: ${account.username}\n` +
            `Mật khẩu mới: ${account.password}\n` +
            `${account.notification || `Đã thông báo qua email: ${account.email}`}`
        )
      } else {
        alert('Thêm giảng viên thành công')
      }

      resetAddForm()
      setIsAddOpen(false)
      loadInstructors()
    } catch (error) {
      console.error('Error creating instructor:', error)
      alert('Lỗi khi thêm giảng viên')
    }
  }

  const handleEditInstructor = async (instructor: Instructor) => {
    setSelectedInstructor(instructor)
    setNewInstructor({
      name: instructor.name,
      email: instructor.email,
      department: instructor.department,
      position: normalizePositionValue(instructor.position),
      status: instructor.status,
      majorId: "",
      responsibleCourseIds: [],
    })
    setIsEditOpen(true)

    const { majors } = await loadCatalog(instructor.department)
    setEditMajorOptions(majors)

    try {
      const res = await fetch(`/api/instructors/courses?code=${encodeURIComponent(String(instructor.code || "").trim())}`)
      const json = await res.json()
      const assigned = (res.ok && json.success ? (json.data || []) : []) as InstructorCourse[]
      const assignedIds = assigned.map((item) => Number(item.id)).filter((id) => Number.isFinite(id) && id > 0)

      const majorFrequency = new Map<string, number>()
      for (const item of assigned) {
        const majorId = String(item.majorId || "").trim()
        if (!majorId) continue
        majorFrequency.set(majorId, (majorFrequency.get(majorId) || 0) + 1)
      }

      const majorCandidates = Array.from(majorFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([majorId]) => majorId)

      const allowedMajorSet = new Set(majors.map((item) => String(item.id || "").trim()))
      const inferredMajorId = majorCandidates.find((majorId) => allowedMajorSet.has(majorId)) || ""

      if (inferredMajorId) {
        const { courses } = await loadCatalog(instructor.department, inferredMajorId)
        setEditCourseOptions(courses)
        const allowedCourseIds = new Set(courses.map((item) => Number(item.id)))
        const filteredAssignedIds = assignedIds.filter((id) => allowedCourseIds.has(id))
        setNewInstructor((prev) => ({
          ...prev,
          majorId: inferredMajorId,
          responsibleCourseIds: filteredAssignedIds,
        }))
      } else {
        setEditCourseOptions([])
        setNewInstructor((prev) => ({
          ...prev,
          majorId: "",
          responsibleCourseIds: [],
        }))
      }
    } catch (error) {
      console.error("Error loading instructor responsible courses for edit:", error)
      setEditCourseOptions([])
    }
  }

  const handleUpdateInstructor = () => {
    if (!selectedInstructor?.code || !newInstructor.name || !newInstructor.email || !newInstructor.department || !newInstructor.position || !newInstructor.status) {
      alert('Vui lòng nhập đầy đủ thông tin cập nhật')
      return
    }

    const selectedCourses = editCourseOptions.filter((course) =>
      newInstructor.responsibleCourseIds.includes(course.id)
    )

    const confirmMessage =
      `Xác nhận cập nhật giảng viên:\n` +
      `- Chức vụ: ${newInstructor.position}\n` +
      `- Trạng thái: ${newInstructor.status}\n` +
      `- Ngành: ${editMajorOptions.find((major) => major.id === newInstructor.majorId)?.name || 'Chưa chọn'}\n` +
      `- Số môn phụ trách: ${selectedCourses.length}`

    if (!confirm(confirmMessage)) {
      return
    }

    fetch('/api/instructors', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: selectedInstructor.code,
        name: newInstructor.name,
        email: newInstructor.email,
        department: newInstructor.department,
        position: newInstructor.position,
        status: newInstructor.status,
        majorId: newInstructor.majorId,
        responsibleCourseIds: newInstructor.responsibleCourseIds,
      }),
    })
      .then(async (res) => {
        let json: any = null
        try {
          json = await res.json()
        } catch {
          json = null
        }

        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `Cập nhật giảng viên thất bại (HTTP ${res.status})`)
        }

        alert('Cập nhật giảng viên thành công')

        setIsEditOpen(false)
        setSelectedInstructor(null)
        setNewInstructor({
          name: "",
          email: "",
          department: "",
          position: "",
          status: "",
          majorId: "",
          responsibleCourseIds: [],
        })
        setEditMajorOptions([])
        setEditCourseOptions([])
        setOpenEditCoursePopover(false)
        loadInstructors()
      })
      .catch((err) => {
        console.warn('Update instructor validation:', err)
        alert(err.message || 'Lỗi khi cập nhật giảng viên')
      })
  }

  const loadInstructorCourses = async (instructorCode?: string) => {
    const code = String(instructorCode || '').trim()
    if (!code) return
    if (coursesByInstructor[code]) return

    try {
      setLoadingInstructorCoursesCode(code)
      const res = await fetch(`/api/instructors/courses?code=${encodeURIComponent(code)}`)
      const json = await res.json()

      if (!res.ok || !json.success) {
        setCoursesByInstructor((prev) => ({ ...prev, [code]: [] }))
        return
      }

      setCoursesByInstructor((prev) => ({
        ...prev,
        [code]: json.data || [],
      }))
    } catch (error) {
      console.error('Error loading instructor courses:', error)
      setCoursesByInstructor((prev) => ({ ...prev, [code]: [] }))
    } finally {
      setLoadingInstructorCoursesCode((prev) => (prev === code ? null : prev))
    }
  }

  const loadCatalog = async (department: string, majorId = "") => {
    const dept = String(department || "").trim()
    if (!dept) {
      return { majors: [] as MajorOption[], courses: [] as CourseOption[] }
    }

    try {
      const params = new URLSearchParams({ department: dept })
      if (majorId) params.set("majorId", majorId)

      const res = await fetch(`/api/instructors/course-options?${params.toString()}`)
      const json = await res.json()

      if (!res.ok || !json.success) {
        return { majors: [] as MajorOption[], courses: [] as CourseOption[] }
      }

      return {
        majors: (json.data?.majors || []) as MajorOption[],
        courses: (json.data?.courses || []) as CourseOption[],
      }
    } catch (error) {
      console.error("Error loading instructor course catalog:", error)
      return { majors: [] as MajorOption[], courses: [] as CourseOption[] }
    }
  }

  const toggleAddResponsibleCourse = (courseId: number) => {
    setNewInstructor((prev) => {
      const exists = prev.responsibleCourseIds.includes(courseId)
      return {
        ...prev,
        responsibleCourseIds: exists
          ? prev.responsibleCourseIds.filter((id) => id !== courseId)
          : [...prev.responsibleCourseIds, courseId],
      }
    })
  }

  const addResponsibleCourseLabel = newInstructor.responsibleCourseIds.length > 0
    ? `Đã chọn ${newInstructor.responsibleCourseIds.length} môn`
    : "Chọn môn phụ trách"

  const toggleEditResponsibleCourse = (courseId: number) => {
    setNewInstructor((prev) => {
      const exists = prev.responsibleCourseIds.includes(courseId)
      return {
        ...prev,
        responsibleCourseIds: exists
          ? prev.responsibleCourseIds.filter((id) => id !== courseId)
          : [...prev.responsibleCourseIds, courseId],
      }
    })
  }

  const editResponsibleCourseLabel = newInstructor.responsibleCourseIds.length > 0
    ? `Đã chọn ${newInstructor.responsibleCourseIds.length} môn`
    : "Chọn môn phụ trách"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Quản lý Giảng viên</h2>
          <p className="text-muted-foreground">
            Thêm, sửa, xóa thông tin giảng viên trong hệ thống
          </p>
        </div>
        <Dialog
          open={isAddOpen}
          onOpenChange={(open) => {
            setIsAddOpen(open)
            resetAddForm()
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Thêm giảng viên
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Thêm giảng viên mới</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Họ và tên</Label>
                <Input
                  id="name"
                  placeholder="VD: Nguyễn Văn A"
                  value={newInstructor.name}
                  onChange={(e) => setNewInstructor({ ...newInstructor, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@uni.edu.vn"
                  value={newInstructor.email}
                  onChange={(e) => setNewInstructor({ ...newInstructor, email: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="department">Khoa/Bộ môn</Label>
                  <Popover open={openAddDepartmentPopover} onOpenChange={setOpenAddDepartmentPopover}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openAddDepartmentPopover}
                        className="w-full justify-between"
                      >
                        {newInstructor.department || "Chọn khoa/bộ môn"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Tìm kiếm khoa..." />
                        <CommandList>
                          <CommandEmpty>Không tìm thấy khoa.</CommandEmpty>
                          <CommandGroup>
                            {departmentOptions.map((d) => (
                              <CommandItem
                                key={d}
                                value={d}
                                onSelect={async () => {
                                  const nextDepartment = d
                                  const { majors } = await loadCatalog(nextDepartment)
                                  setAddMajorOptions(majors)
                                  setAddCourseOptions([])
                                  setNewInstructor({
                                    ...newInstructor,
                                    department: nextDepartment,
                                    majorId: "",
                                    responsibleCourseIds: [],
                                  })
                                  setOpenAddDepartmentPopover(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    newInstructor.department === d ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {d}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="position">Chức vụ</Label>
                  <Select
                    value={newInstructor.position}
                    onValueChange={(value) => setNewInstructor({ ...newInstructor, position: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn chức vụ" />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITION_OPTIONS.map((position) => (
                        <SelectItem key={`add-position-${position}`} value={position}>{position}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-major">Ngành</Label>
                <Select
                  value={newInstructor.majorId}
                  onValueChange={async (value) => {
                    const { courses } = await loadCatalog(newInstructor.department, value)
                    setAddCourseOptions(courses)
                    setNewInstructor((prev) => ({ ...prev, majorId: value, responsibleCourseIds: [] }))
                  }}
                  disabled={!newInstructor.department}
                >
                  <SelectTrigger id="add-major">
                    <SelectValue placeholder="Chọn ngành" />
                  </SelectTrigger>
                  <SelectContent>
                    {addMajorOptions.map((major) => (
                      <SelectItem key={major.id} value={major.id}>{major.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Môn phụ trách (theo ngành)</Label>
                <Popover open={openAddCoursePopover} onOpenChange={setOpenAddCoursePopover}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openAddCoursePopover}
                      className="w-full justify-between"
                      disabled={!newInstructor.majorId}
                    >
                      {addResponsibleCourseLabel}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Tìm môn phụ trách..." />
                      <CommandList>
                        <CommandEmpty>Không tìm thấy môn phù hợp.</CommandEmpty>
                        <CommandGroup>
                          {addCourseOptions.map((course) => (
                            <CommandItem
                              key={`add-course-${course.id}`}
                              value={`${course.name} ${course.type} ${course.year} ${course.semester}`}
                              onSelect={() => toggleAddResponsibleCourse(course.id)}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  newInstructor.responsibleCourseIds.includes(course.id) ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <span>{course.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {course.type || "Chưa rõ loại"} • Năm {course.year || "?"} • HK {course.semester || "?"}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">Trạng thái</Label>
                <Select
                  value={newInstructor.status}
                  onValueChange={(value: any) => setNewInstructor({ ...newInstructor, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Có thể dạy">Có thể dạy</SelectItem>
                    <SelectItem value="Tạm dừng">Tạm dừng</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Hủy</Button>
              </DialogClose>
              <Button
                onClick={handleAddInstructor}
              >
                Thêm giảng viên
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/50">
        {loadError && <div className="p-4 text-red-600">{loadError}</div>}
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm theo tên, email hoặc chức vụ..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Popover open={openDepartmentFilterPopover} onOpenChange={setOpenDepartmentFilterPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openDepartmentFilterPopover}
                  className="w-[220px] justify-between"
                >
                  {selectedDepartmentFilter || "Lọc theo khoa"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Tìm kiếm khoa..." />
                  <CommandList>
                    <CommandEmpty>Không tìm thấy khoa.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="all"
                        onSelect={() => {
                          setSelectedDepartmentFilter("")
                          setOpenDepartmentFilterPopover(false)
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedDepartmentFilter === "" ? "opacity-100" : "opacity-0"
                          )}
                        />
                        Tất cả khoa
                      </CommandItem>
                      {departmentOptions.map((dep) => (
                        <CommandItem
                          key={dep}
                          value={dep}
                          onSelect={() => {
                            setSelectedDepartmentFilter(dep === selectedDepartmentFilter ? "" : dep)
                            setOpenDepartmentFilterPopover(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedDepartmentFilter === dep ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {dep}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Select
              value={selectedStatusFilter || "all"}
              onValueChange={(value) => setSelectedStatusFilter(value === "all" ? "" : value)}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Lọc trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                <SelectItem value="Có thể dạy">Có thể dạy</SelectItem>
                <SelectItem value="Tạm dừng">Tạm dừng</SelectItem>
                <SelectItem value="Vô hiệu hóa">Vô hiệu hóa</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto">
              <Badge variant="secondary" className="text-sm font-medium">
                Tổng giảng viên: {visibleInstructorCount}/{totalInstructorCount}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Họ và tên</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Chức vụ</TableHead>
                <TableHead>Khoa/Bộ môn</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedVisibleInstructors.map((instructor) => (
                <TableRow key={getInstructorKey(instructor)}>
                  <TableCell className="font-medium">
                    <HoverCard openDelay={120} closeDelay={120}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onMouseEnter={() => loadInstructorCourses(instructor.code)}
                          onFocus={() => loadInstructorCourses(instructor.code)}
                          onClick={() => loadInstructorCourses(instructor.code)}
                        >
                          {instructor.name}
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-[360px]">
                        <div className="space-y-2">
                          <p className="text-sm font-semibold">Môn giảng viên phụ trách</p>
                          {loadingInstructorCoursesCode === instructor.code ? (
                            <p className="text-sm text-muted-foreground">Đang tải dữ liệu...</p>
                          ) : (coursesByInstructor[instructor.code || ''] || []).length === 0 ? (
                            <p className="text-sm text-muted-foreground">Giảng viên chưa được phân công môn phụ trách.</p>
                          ) : (
                            <div className="space-y-2">
                              {(coursesByInstructor[instructor.code || ''] || []).map((course) => (
                                <div key={`${instructor.code}-${course.id}`} className="rounded-md border p-2">
                                  <p className="text-sm font-medium">{course.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {course.type || 'Chưa rõ loại'} • {course.credits} tín chỉ • Năm {course.year} • Học kỳ {course.semester}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {instructor.email}
                    </div>
                  </TableCell>
                  <TableCell>{instructor.position}</TableCell>
                  <TableCell>{instructor.department}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        instructor.status === "Có thể dạy"
                          ? "default"
                          : instructor.status === "Tạm dừng"
                            ? "secondary"
                            : instructor.status === "Vô hiệu hóa"
                              ? "destructive"
                              : "outline"
                      }
                    >
                      {instructor.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => handleEditInstructor(instructor)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showPreferencesForm ? (
      <section className="space-y-3">
        <div>
          <h3 className="text-xl font-semibold tracking-tight text-foreground">Form quản lý nguyện vọng giảng viên</h3>
          <p className="text-sm text-muted-foreground">
            Theo dõi giảng viên có nguyện vọng, cập nhật mức độ ưu tiên nguyện vọng thời gian và xem nguyện vọng đặc biệt.
          </p>
        </div>
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Quản lý nguyện vọng giảng viên</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="rounded-lg border">
              <div className="border-b px-4 py-3 font-medium">Giảng viên có nguyện vọng</div>
              <div className="max-h-[420px] overflow-auto p-2 space-y-2">
                {loadingPreferenceInstructors ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Đang tải danh sách...</p>
                ) : preferenceInstructors.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Chưa có giảng viên nào gửi nguyện vọng.</p>
                ) : (
                  preferenceInstructors.map((item) => (
                    <button
                      key={item.maGV}
                      type="button"
                      className={cn(
                        "w-full rounded-md border px-3 py-2 text-left transition-colors",
                        selectedPreferenceInstructor === item.maGV
                          ? "border-primary bg-primary/10"
                          : "hover:bg-muted/40"
                      )}
                      onClick={() => {
                        setSelectedPreferenceInstructor(item.maGV)
                        loadPreferenceDetails(item.maGV)
                      }}
                    >
                      <p className="font-medium">{item.tenGV}</p>
                      {(item.pendingOtherCount || 0) > 0 ? (
                        <span
                          className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-red-500"
                          title="Có nguyện vọng đặc biệt đang chờ xử lý"
                        />
                      ) : null}
                      <p className="text-xs text-muted-foreground">{item.emailGV}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Thời gian: {item.timeCount} • Đặc biệt: {item.otherCount}
                        {(item.pendingOtherCount || 0) > 0 ? ` • Chờ duyệt: ${item.pendingOtherCount}` : ''}
                      </p>
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
                            value={priorityDraftById[item.id] || ''}
                            onChange={(event) =>
                              setPriorityDraftById((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                            placeholder="Nhập mức độ ưu tiên"
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
                <h3 className="mb-3 font-medium">Nguyện vọng đặc biệt (duyệt/không duyệt)</h3>
                {loadingPreferenceDetails ? (
                  <p className="text-sm text-muted-foreground">Đang tải chi tiết...</p>
                ) : otherPreferences.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Giảng viên chưa có nguyện vọng đặc biệt.</p>
                ) : (
                  <div className="space-y-2">
                    {otherPreferences.map((item) => (
                      <div key={item.id} className="rounded-md border p-3">
                        <p className={cn("font-medium", getApprovalTextColor(item.trangThaiDuyet))}>{item.tenNV}</p>
                        <p className="text-sm text-muted-foreground">Mức độ ưu tiên: {item.giaTri}</p>
                        <p className={cn("mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", getApprovalBadgeClassName(item.trangThaiDuyet))}>
                          {item.trangThaiDuyet}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() => handleUpdateOtherApproval(item.id, "Đã duyệt")}
                          >
                            Duyệt
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => handleUpdateOtherApproval(item.id, "Không duyệt")}
                          >
                            Không duyệt
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            </div>
          </CardContent>
        </Card>
      </section>
      ) : null}

      {/* Dialog sửa giảng viên */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cập nhật giảng viên</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Họ và tên</Label>
                <Input
                  id="edit-name"
                  value={newInstructor.name}
                  disabled
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={newInstructor.email}
                  disabled
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-department">Khoa/Bộ môn</Label>
                <Select
                  value={newInstructor.department}
                  onValueChange={() => {}}
                  disabled
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn khoa/bộ môn" />
                  </SelectTrigger>
                  <SelectContent>
                    {departmentOptions.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-position">Chức vụ</Label>
                <Select
                  value={newInstructor.position}
                  onValueChange={(value) => setNewInstructor({ ...newInstructor, position: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn chức vụ" />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITION_OPTIONS.map((position) => (
                      <SelectItem key={`edit-position-${position}`} value={position}>{position}</SelectItem>
                    ))}
                    {!!newInstructor.position && !POSITION_OPTIONS.includes(newInstructor.position) ? (
                      <SelectItem value={newInstructor.position}>{newInstructor.position}</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-major">Ngành</Label>
              <Select
                value={newInstructor.majorId}
                onValueChange={async (value) => {
                  const { courses } = await loadCatalog(newInstructor.department, value)
                  setEditCourseOptions(courses)
                  setNewInstructor((prev) => ({ ...prev, majorId: value, responsibleCourseIds: [] }))
                }}
                disabled={!newInstructor.department}
              >
                <SelectTrigger id="edit-major">
                  <SelectValue placeholder="Chọn ngành" />
                </SelectTrigger>
                <SelectContent>
                  {editMajorOptions.map((major) => (
                    <SelectItem key={major.id} value={major.id}>{major.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Môn phụ trách (theo ngành)</Label>
              <Popover open={openEditCoursePopover} onOpenChange={setOpenEditCoursePopover}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openEditCoursePopover}
                    className="w-full justify-between"
                    disabled={!newInstructor.majorId}
                  >
                    {editResponsibleCourseLabel}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Tìm môn phụ trách..." />
                    <CommandList>
                      <CommandEmpty>Không tìm thấy môn phù hợp.</CommandEmpty>
                      <CommandGroup>
                        {editCourseOptions.map((course) => (
                          <CommandItem
                            key={`edit-course-${course.id}`}
                            value={`${course.name} ${course.type} ${course.year} ${course.semester}`}
                            onSelect={() => toggleEditResponsibleCourse(course.id)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                newInstructor.responsibleCourseIds.includes(course.id) ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{course.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {course.type || "Chưa rõ loại"} • Năm {course.year || "?"} • HK {course.semester || "?"}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-status">Trạng thái</Label>
              <Select
                value={newInstructor.status}
                onValueChange={(value: any) => setNewInstructor({ ...newInstructor, status: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Có thể dạy">Có thể dạy</SelectItem>
                  <SelectItem value="Tạm dừng">Tạm dừng</SelectItem>
                  <SelectItem value="Vô hiệu hóa">Vô hiệu hóa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Hủy</Button>
            </DialogClose>
            <Button onClick={handleUpdateInstructor}>Cập nhật</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
