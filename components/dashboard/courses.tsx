"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Edit, Trash2, BookOpen, ChevronsUpDown, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
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

const initialCourses: any[] = []

interface MajorOption {
  id: string
  name: string
  departmentId: string
}

interface InstructorOption {
  code: string
  name: string
  email: string
  position: string
  department: string
}

interface CourseEditState {
  id: number
  majorId: string
  name: string
  type: string
  credits: string
  year: string
  semester: string
  instructorCodes: string[]
}

const extractFirstNumber = (value: unknown) => {
  const matched = String(value || '').match(/\d+/)
  return matched ? Number(matched[0]) : NaN
}

const parseSemesterOrder = (semester: string) => {
  const normalized = String(semester || '').toLowerCase()
  const matchedNumber = normalized.match(/\d+/)
  if (matchedNumber) {
    return Number(matchedNumber[0])
  }

  if (normalized.includes('hè') || normalized.includes('he')) {
    return 3
  }

  return 99
}

export function CoursesModule() {
  const [courses, setCourses] = useState(initialCourses)
  const [majors, setMajors] = useState<MajorOption[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [selectedMajor, setSelectedMajor] = useState("")
  const [selectedCourseType, setSelectedCourseType] = useState("")
  const [openMajorPopover, setOpenMajorPopover] = useState(false)
  const [openAddMajorPopover, setOpenAddMajorPopover] = useState(false)
  const [openAddInstructorPopover, setOpenAddInstructorPopover] = useState(false)
  const [openEditInstructorPopover, setOpenEditInstructorPopover] = useState(false)
  const [addInstructorOptions, setAddInstructorOptions] = useState<InstructorOption[]>([])
  const [editInstructorOptions, setEditInstructorOptions] = useState<InstructorOption[]>([])
  const [instructorsByCourse, setInstructorsByCourse] = useState<Record<number, Array<{ code: string; name: string; email: string; position: string; department: string }>>>({})
  const [loadingCourseInstructorId, setLoadingCourseInstructorId] = useState<number | null>(null)
  const [editingCourse, setEditingCourse] = useState<CourseEditState | null>(null)
  const [newCourse, setNewCourse] = useState({
    majorId: "",
    name: "",
    type: "Lý thuyết",
    credits: "",
    year: "1",
    semester: "1",
    instructorCodes: [] as string[],
  })

  const computedPeriods = (() => {
    const credits = Number(newCourse.credits)
    if (Number.isNaN(credits) || credits <= 0) return 0
    return newCourse.type === 'Thực hành' ? credits * 30 : credits * 15
  })()

  const loadCourses = () => {
    fetch('/api/courses')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setCourses(json.data || [])
          if (!json.data || json.data.length === 0) {
            setLoadError('Không thể tải dữ liệu môn học. Kiểm tra kết nối cơ sở dữ liệu.')
          }
        } else {
          setLoadError(json.error || 'Lỗi không xác định khi tải môn học')
          setCourses([])
        }
      })
      .catch(err => {
        console.error('Error loading courses:', err)
        setLoadError(err.message || 'Lỗi khi gọi API')
        setCourses([])
      })
  }

  useEffect(() => {
    loadCourses()

    fetch('/api/classes/options')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          const majorData = (json.data?.majors || []).map((item: any) => ({
            id: String(item.id || ''),
            name: String(item.name || '').trim(),
            departmentId: String(item.departmentId || '').trim(),
          }))
          setMajors(majorData)
        }
      })
      .catch(err => {
        console.error('Error loading majors for courses:', err)
      })
  }, [])

  const majorOptions = Array.from(new Set(courses.map((c) => c.major).filter(Boolean))) as string[]
  const addMajorLabel = majors.find((major) => major.id === newCourse.majorId)?.name || "Chọn ngành"
  const addInstructorsLabel = newCourse.instructorCodes.length > 0
    ? `Đã chọn ${newCourse.instructorCodes.length} giảng viên`
    : "Chọn giảng viên phụ trách"
  const editInstructorsLabel = editingCourse && editingCourse.instructorCodes.length > 0
    ? `Đã chọn ${editingCourse.instructorCodes.length} giảng viên`
    : "Chọn giảng viên phụ trách"
  const yearOptions = Array.from({ length: 4 }, (_, index) => String(index + 1))
  const semesterOptions = Array.from(
    new Set(
      courses
        .filter((course) => {
          if (!newCourse.majorId) return false
          const courseYear = extractFirstNumber(course.year)
          return String(course.majorId || '').trim() === String(newCourse.majorId).trim() && courseYear === Number(newCourse.year)
        })
        .map((course) => extractFirstNumber(course.semester))
        .filter((semesterNumber) => !Number.isNaN(semesterNumber) && semesterNumber >= 1 && semesterNumber <= 10)
    )
  ).sort((a, b) => a - b)

  const editSemesterOptions = Array.from(
    new Set(
      courses
        .filter((course) => {
          if (!editingCourse?.majorId) return false
          const courseYear = extractFirstNumber(course.year)
          return String(course.majorId || '').trim() === String(editingCourse.majorId).trim() && courseYear === Number(editingCourse.year)
        })
        .map((course) => extractFirstNumber(course.semester))
        .filter((semesterNumber) => !Number.isNaN(semesterNumber) && semesterNumber >= 1 && semesterNumber <= 10)
    )
  ).sort((a, b) => a - b)

  const resetAddCourseForm = () => {
    setNewCourse({
      majorId: "",
      name: "",
      type: "Lý thuyết",
      credits: "",
      year: "1",
      semester: "1",
      instructorCodes: [],
    })
    setOpenAddMajorPopover(false)
    setOpenAddInstructorPopover(false)
    setAddInstructorOptions([])
  }

  const loadAssignableInstructors = async (majorId: string, year?: number, semester?: number) => {
    if (!majorId) return [] as InstructorOption[]

    try {
      const params = new URLSearchParams({ majorId })
      if (Number.isFinite(year) && (year || 0) > 0) {
        params.set('year', String(year))
      }
      if (Number.isFinite(semester) && (semester || 0) > 0) {
        params.set('semester', String(semester))
      }

      const res = await fetch(`/api/courses/instructors?${params.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) return []

      return (json.data || []).map((item: any) => ({
        code: String(item.code || '').trim(),
        name: String(item.name || '').trim(),
        email: String(item.email || '').trim(),
        position: String(item.position || '').trim(),
        department: String(item.department || '').trim(),
      }))
    } catch (error) {
      console.error('Error loading assignable instructors:', error)
      return []
    }
  }

  const loadAssignedInstructorCodes = async (courseId: number) => {
    if (!courseId || courseId <= 0) return [] as string[]

    try {
      const res = await fetch(`/api/courses/instructors?courseId=${courseId}`)
      const json = await res.json()
      if (!res.ok || !json.success) return []
      return (json.data || []).map((item: any) => String(item.code || '').trim()).filter(Boolean)
    } catch (error) {
      console.error('Error loading assigned instructor codes:', error)
      return []
    }
  }

  const openEditCourseDialog = async (course: any) => {
    if (!course?.id) {
      alert('Không thể sửa môn do thiếu mã môn')
      return
    }

    const courseId = Number(course.id)
    const majorId = String(course.majorId || '').trim()

    setEditingCourse({
      id: courseId,
      majorId,
      name: String(course.name || '').trim(),
      type: String(course.type || 'Lý thuyết').trim() || 'Lý thuyết',
      credits: String(Number(course.credits || 0)),
      year: String(extractFirstNumber(course.year) || 1),
      semester: String(extractFirstNumber(course.semester) || 1),
      instructorCodes: [],
    })
    setIsEditOpen(true)

    const [availableInstructors, assignedCodes] = await Promise.all([
      loadAssignableInstructors(
        majorId,
        extractFirstNumber(course.year),
        extractFirstNumber(course.semester)
      ),
      loadAssignedInstructorCodes(courseId),
    ])

    const availableCodeSet = new Set(availableInstructors.map((item: InstructorOption) => item.code))
    const filteredAssignedCodes = assignedCodes.filter((code: string) => availableCodeSet.has(code))

    setEditInstructorOptions(availableInstructors)
    setEditingCourse((prev) => {
      if (!prev || prev.id !== courseId) return prev
      return { ...prev, instructorCodes: filteredAssignedCodes }
    })
  }

  const handleUpdateCourse = async () => {
    if (!editingCourse) return

    if (!editingCourse.majorId || !editingCourse.name.trim() || !editingCourse.type || !editingCourse.credits || !editingCourse.year || !editingCourse.semester) {
      alert('Vui lòng nhập đầy đủ thông tin môn học')
      return
    }

    const credits = Number(editingCourse.credits)
    if (Number.isNaN(credits) || credits <= 0) {
      alert('Số tín chỉ phải lớn hơn 0')
      return
    }

    if (editingCourse.type === 'Thực hành' && !editingCourse.name.toLowerCase().includes('thực hành')) {
      alert('Môn thực hành phải có chữ "thực hành" trong tên môn')
      return
    }

    if (editingCourse.instructorCodes.length === 0) {
      alert('Vui lòng chọn ít nhất 1 giảng viên phụ trách')
      return
    }

    const shouldUpdate = confirm(`Xác nhận cập nhật môn "${editingCourse.name}"?`)
    if (!shouldUpdate) return

    try {
      const res = await fetch('/api/courses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCourse.id,
          majorId: editingCourse.majorId,
          name: editingCourse.name.trim(),
          type: editingCourse.type,
          credits,
          year: Number(editingCourse.year),
          semester: Number(editingCourse.semester),
          instructorCodes: editingCourse.instructorCodes,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Cập nhật môn học thất bại')
        return
      }

      alert('Cập nhật môn học thành công')
      setIsEditOpen(false)
      setEditingCourse(null)
      loadCourses()
    } catch (error) {
      console.error('Error updating course:', error)
      alert('Lỗi khi cập nhật môn học')
    }
  }

  const filteredCourses = courses.filter(
    (course) => {
      const matchesSearch =
        String(course.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(course.major || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(course.type || '').toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesMajor = selectedMajor === "" || course.major === selectedMajor
      const courseType = String(course.type || '').toLowerCase()
      const matchesType =
        selectedCourseType === "" ||
        (selectedCourseType === "Lý thuyết" && courseType.includes('lý thuyết')) ||
        (selectedCourseType === "Thực hành" && courseType.includes('thực hành'))
      
      return matchesSearch && matchesMajor && matchesType
    }
  )

  const displayCourses = selectedMajor
    ? [...filteredCourses].sort((a, b) => {
        const semesterA = parseSemesterOrder(String(a.semester || ''))
        const semesterB = parseSemesterOrder(String(b.semester || ''))

        if (semesterA !== semesterB) return semesterA - semesterB

        return String(a.name || '').localeCompare(String(b.name || ''), 'vi')
      })
    : filteredCourses

  const selectedMajorCourseCount = selectedMajor ? displayCourses.length : 0
  const selectedMajorTotalCredits = selectedMajor
    ? displayCourses.reduce((sum, course) => sum + Number(course.credits || 0), 0)
    : 0

  const toggleAddInstructor = (code: string) => {
    setNewCourse((prev) => {
      const exists = prev.instructorCodes.includes(code)
      return {
        ...prev,
        instructorCodes: exists
          ? prev.instructorCodes.filter((item) => item !== code)
          : [...prev.instructorCodes, code],
      }
    })
  }

  const toggleEditInstructor = (code: string) => {
    setEditingCourse((prev) => {
      if (!prev) return prev
      const exists = prev.instructorCodes.includes(code)
      return {
        ...prev,
        instructorCodes: exists
          ? prev.instructorCodes.filter((item) => item !== code)
          : [...prev.instructorCodes, code],
      }
    })
  }

  const handleAddCourse = async () => {
    if (!newCourse.majorId || !newCourse.name.trim() || !newCourse.type || !newCourse.credits || !newCourse.year || !newCourse.semester) {
      alert('Vui lòng nhập đầy đủ thông tin môn học')
      return
    }

    const credits = Number(newCourse.credits)
    if (Number.isNaN(credits) || credits <= 0) {
      alert('Số tín chỉ phải lớn hơn 0')
      return
    }

    if (newCourse.type === 'Thực hành' && !newCourse.name.toLowerCase().includes('thực hành')) {
      alert('Môn thực hành phải có chữ "thực hành" trong tên môn')
      return
    }

    if (newCourse.instructorCodes.length === 0) {
      alert('Vui lòng chọn ít nhất 1 giảng viên phụ trách')
      return
    }

    const shouldCreate = confirm(
      `Xác nhận thêm môn mới:\n- Ngành: ${addMajorLabel}\n- Tên môn: ${newCourse.name}\n- Loại: ${newCourse.type}\n- Tín chỉ: ${credits}\n- Số tiết: ${computedPeriods}\n- Năm: ${newCourse.year}\n- Học kỳ: ${newCourse.semester}\n- Giảng viên phụ trách: ${newCourse.instructorCodes.length}`
    )
    if (!shouldCreate) return

    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          majorId: newCourse.majorId,
          name: newCourse.name.trim(),
          type: newCourse.type,
          credits,
          year: Number(newCourse.year),
          semester: Number(newCourse.semester),
          instructorCodes: newCourse.instructorCodes,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Thêm môn học thất bại')
        return
      }

      alert('Thêm môn học thành công')
      resetAddCourseForm()
      setIsAddOpen(false)

      loadCourses()
    } catch (error) {
      console.error('Error adding course:', error)
      alert('Lỗi khi thêm môn học')
    }
  }

  const handleDeleteCourse = async (course: any) => {
    if (!course?.id) {
      alert('Không thể xóa môn do thiếu mã môn')
      return
    }

    const shouldDelete = confirm(`Xác nhận xóa môn "${course.name}"?`)
    if (!shouldDelete) return

    try {
      const res = await fetch(`/api/courses?id=${course.id}`, { method: 'DELETE' })
      const json = await res.json()

      if (!res.ok || !json.success) {
        alert(json.error || 'Xóa môn học thất bại')
        return
      }

      alert('Xóa môn học thành công')
      loadCourses()
    } catch (error) {
      console.error('Error deleting course:', error)
      alert('Lỗi khi xóa môn học')
    }
  }

  const loadCourseInstructors = async (courseId?: number) => {
    if (!courseId || courseId <= 0) return
    if (instructorsByCourse[courseId]) return

    try {
      setLoadingCourseInstructorId(courseId)
      const res = await fetch(`/api/courses/instructors?courseId=${courseId}`)
      const json = await res.json()

      if (!res.ok || !json.success) {
        setInstructorsByCourse((prev) => ({ ...prev, [courseId]: [] }))
        return
      }

      setInstructorsByCourse((prev) => ({
        ...prev,
        [courseId]: json.data || [],
      }))
    } catch (error) {
      console.error('Error loading course instructors:', error)
      setInstructorsByCourse((prev) => ({ ...prev, [courseId]: [] }))
    } finally {
      setLoadingCourseInstructorId((prev) => (prev === courseId ? null : prev))
    }
  }

  useEffect(() => {
    if (!semesterOptions.length) {
      if (newCourse.semester !== "") {
        setNewCourse((prev) => ({ ...prev, semester: "" }))
      }
      return
    }

    if (!semesterOptions.includes(Number(newCourse.semester))) {
      setNewCourse((prev) => ({ ...prev, semester: String(semesterOptions[0]) }))
    }
  }, [newCourse.majorId, newCourse.year, courses])

  useEffect(() => {
    if (!editingCourse) return

    if (!editSemesterOptions.length) {
      if (editingCourse.semester !== "") {
        setEditingCourse((prev) => (prev ? { ...prev, semester: "" } : prev))
      }
      return
    }

    if (!editSemesterOptions.includes(Number(editingCourse.semester))) {
      setEditingCourse((prev) => (prev ? { ...prev, semester: String(editSemesterOptions[0]) } : prev))
    }
  }, [editingCourse?.majorId, editingCourse?.year, courses])

  useEffect(() => {
    const majorId = String(newCourse.majorId || '').trim()

    if (!majorId) {
      setAddInstructorOptions([])
      if (newCourse.instructorCodes.length > 0) {
        setNewCourse((prev) => ({ ...prev, instructorCodes: [] }))
      }
      return
    }

    loadAssignableInstructors(
      majorId,
      Number(newCourse.year) || undefined,
      Number(newCourse.semester) || undefined
    ).then((items) => {
      setAddInstructorOptions(items)
      const validCodes = new Set(items.map((item: InstructorOption) => item.code))
      setNewCourse((prev) => ({
        ...prev,
        instructorCodes: prev.instructorCodes.filter((code) => validCodes.has(code)),
      }))
    })
  }, [newCourse.majorId, newCourse.year, newCourse.semester])

  useEffect(() => {
    if (!editingCourse?.majorId) {
      setEditInstructorOptions([])
      return
    }

    const majorId = String(editingCourse.majorId).trim()
    loadAssignableInstructors(
      majorId,
      Number(editingCourse.year) || undefined,
      Number(editingCourse.semester) || undefined
    ).then((items) => {
      setEditInstructorOptions(items)
      const validCodes = new Set(items.map((item: InstructorOption) => item.code))
      setEditingCourse((prev) => {
        if (!prev || String(prev.majorId).trim() !== majorId) return prev
        return {
          ...prev,
          instructorCodes: prev.instructorCodes.filter((code) => validCodes.has(code)),
        }
      })
    })
  }, [editingCourse?.majorId, editingCourse?.year, editingCourse?.semester])

  const editComputedPeriods = (() => {
    if (!editingCourse) return 0
    const credits = Number(editingCourse.credits)
    if (Number.isNaN(credits) || credits <= 0) return 0
    return editingCourse.type === 'Thực hành' ? credits * 30 : credits * 15
  })()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Quản lý Môn học</h2>
          <p className="text-muted-foreground">
            Quản lý danh sách môn học, số tín chỉ và giờ học
          </p>
        </div>
        <Dialog
          open={isAddOpen}
          onOpenChange={(open) => {
            setIsAddOpen(open)
            if (!open) {
              resetAddCourseForm()
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Thêm môn học
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Thêm môn học mới</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Ngành</Label>
                <Popover open={openAddMajorPopover} onOpenChange={setOpenAddMajorPopover}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openAddMajorPopover}
                      className="w-full justify-between"
                      title={addMajorLabel}
                    >
                      <span className="min-w-0 flex-1 truncate text-left">{addMajorLabel}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Tìm kiếm ngành..." />
                      <CommandList>
                        <CommandEmpty>Không tìm thấy ngành.</CommandEmpty>
                        <CommandGroup>
                          {majors.map((major) => (
                            <CommandItem
                              key={major.id}
                              value={major.name}
                              onSelect={() => {
                                setNewCourse({ ...newCourse, majorId: major.id, instructorCodes: [] })
                                setOpenAddMajorPopover(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  newCourse.majorId === major.id ? "opacity-100" : "opacity-0"
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

              <div className="grid gap-2">
                <Label>Giảng viên phụ trách</Label>
                <Popover open={openAddInstructorPopover} onOpenChange={setOpenAddInstructorPopover}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openAddInstructorPopover}
                      className="w-full justify-between"
                      disabled={!newCourse.majorId}
                    >
                      <span className="min-w-0 flex-1 truncate text-left">{addInstructorsLabel}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Tìm kiếm giảng viên..." />
                      <CommandList>
                        <CommandEmpty>Không có giảng viên thuộc khoa của ngành này.</CommandEmpty>
                        <CommandGroup>
                          {addInstructorOptions.map((instructor) => (
                            <CommandItem
                              key={instructor.code}
                              value={`${instructor.name} ${instructor.code} ${instructor.email}`}
                              onSelect={() => toggleAddInstructor(instructor.code)}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  newCourse.instructorCodes.includes(instructor.code) ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span className="min-w-0 flex-1 truncate" title={`${instructor.name} - ${instructor.position || 'Giảng viên'}`}>
                                {instructor.name} - {instructor.position || 'Giảng viên'}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="year">Năm</Label>
                  <Select
                    value={newCourse.year}
                    onValueChange={(value) => setNewCourse({ ...newCourse, year: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn năm" />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="semester">Học kỳ</Label>
                  <Select
                    value={newCourse.semester}
                    onValueChange={(value) => setNewCourse({ ...newCourse, semester: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn học kỳ" />
                    </SelectTrigger>
                    <SelectContent>
                      {semesterOptions.length > 0 ? (
                        semesterOptions.map((option) => (
                          <SelectItem key={option} value={String(option)}>{`Học kỳ ${option}`}</SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>Chưa có học kỳ cho năm này</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">Tên môn học</Label>
                <Input
                  id="name"
                  placeholder="VD: Cơ sở dữ liệu"
                  value={newCourse.name}
                  onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type">Loại học phần</Label>
                <Select
                  value={newCourse.type}
                  onValueChange={(value) => setNewCourse({ ...newCourse, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn loại học phần" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Lý thuyết">Lý thuyết</SelectItem>
                    <SelectItem value="Thực hành">Thực hành</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="credits">Số tín chỉ</Label>
                  <Input
                    id="credits"
                    type="number"
                    min="1"
                    placeholder="3"
                    value={newCourse.credits}
                    onChange={(e) => setNewCourse({ ...newCourse, credits: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Số tiết (tự tính)</Label>
                  <Input value={String(computedPeriods)} disabled />
                </div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Hủy</Button>
              </DialogClose>
              <Button onClick={handleAddCourse}>Thêm môn học</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isEditOpen}
          onOpenChange={(open) => {
            setIsEditOpen(open)
            if (!open) {
              setEditingCourse(null)
              setOpenEditInstructorPopover(false)
              setEditInstructorOptions([])
            }
          }}
        >
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Chỉnh sửa môn học</DialogTitle>
            </DialogHeader>
            {editingCourse ? (
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Ngành</Label>
                  <Select
                    value={editingCourse.majorId}
                    onValueChange={(value) => setEditingCourse({ ...editingCourse, majorId: value, instructorCodes: [] })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn ngành" />
                    </SelectTrigger>
                    <SelectContent>
                      {majors.map((major) => (
                        <SelectItem key={major.id} value={major.id}>{major.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Giảng viên phụ trách</Label>
                  <Popover open={openEditInstructorPopover} onOpenChange={setOpenEditInstructorPopover}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openEditInstructorPopover}
                        className="w-full justify-between"
                        disabled={!editingCourse.majorId}
                      >
                        <span className="min-w-0 flex-1 truncate text-left">{editInstructorsLabel}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Tìm kiếm giảng viên..." />
                        <CommandList>
                          <CommandEmpty>Không có giảng viên thuộc khoa của ngành này.</CommandEmpty>
                          <CommandGroup>
                            {editInstructorOptions.map((instructor) => (
                              <CommandItem
                                key={instructor.code}
                                value={`${instructor.name} ${instructor.code} ${instructor.email}`}
                                onSelect={() => toggleEditInstructor(instructor.code)}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    editingCourse.instructorCodes.includes(instructor.code) ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span className="min-w-0 flex-1 truncate" title={`${instructor.name} - ${instructor.position || 'Giảng viên'}`}>
                                  {instructor.name} - {instructor.position || 'Giảng viên'}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Năm</Label>
                    <Select
                      value={editingCourse.year}
                      onValueChange={(value) => setEditingCourse({ ...editingCourse, year: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn năm" />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map((option) => (
                          <SelectItem key={option} value={option}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Học kỳ</Label>
                    <Select
                      value={editingCourse.semester}
                      onValueChange={(value) => setEditingCourse({ ...editingCourse, semester: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn học kỳ" />
                      </SelectTrigger>
                      <SelectContent>
                        {editSemesterOptions.length > 0 ? (
                          editSemesterOptions.map((option) => (
                            <SelectItem key={option} value={String(option)}>{`Học kỳ ${option}`}</SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>Chưa có học kỳ cho năm này</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Tên môn học</Label>
                  <Input
                    value={editingCourse.name}
                    onChange={(e) => setEditingCourse({ ...editingCourse, name: e.target.value })}
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Loại học phần</Label>
                  <Select
                    value={editingCourse.type}
                    onValueChange={(value) => setEditingCourse({ ...editingCourse, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn loại học phần" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Lý thuyết">Lý thuyết</SelectItem>
                      <SelectItem value="Thực hành">Thực hành</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Số tín chỉ</Label>
                    <Input
                      type="number"
                      min="1"
                      value={editingCourse.credits}
                      onChange={(e) => setEditingCourse({ ...editingCourse, credits: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Số tiết (tự tính)</Label>
                    <Input value={String(editComputedPeriods)} disabled />
                  </div>
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Hủy</Button>
              </DialogClose>
              <Button onClick={handleUpdateCourse}>Lưu thay đổi</Button>
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
                placeholder="Tìm kiếm môn học..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Popover open={openMajorPopover} onOpenChange={setOpenMajorPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openMajorPopover}
                  className="w-[180px] justify-between"
                  title={selectedMajor || "Chọn ngành..."}
                >
                  <span className="min-w-0 flex-1 truncate text-left">
                    {selectedMajor || "Chọn ngành..."}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[180px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Tìm kiếm ngành..." />
                  <CommandEmpty>Không tìm thấy ngành.</CommandEmpty>
                  <CommandList>
                    <CommandGroup>
                      <CommandItem
                        value="all"
                        onSelect={() => {
                          setSelectedMajor("")
                          setOpenMajorPopover(false)
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedMajor === "" ? "opacity-100" : "opacity-0"
                          )}
                        />
                        Tất cả
                      </CommandItem>
                      {majorOptions.map((major) => (
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
                          <span className="min-w-0 flex-1 truncate" title={major}>{major}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Select
              value={selectedCourseType || "all"}
              onValueChange={(value) => setSelectedCourseType(value === "all" ? "" : value)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Loại" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="Lý thuyết">Lý thuyết</SelectItem>
                <SelectItem value="Thực hành">Thực hành</SelectItem>
              </SelectContent>
            </Select>
            {selectedMajor ? (
              <div className="ml-auto flex items-center gap-2">
                <Badge variant="secondary">Số môn: {selectedMajorCourseCount}</Badge>
                <Badge variant="secondary">Tổng tín chỉ: {selectedMajorTotalCredits}</Badge>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên môn học</TableHead>
                <TableHead>Tín chỉ</TableHead>
                <TableHead>Số tiết học</TableHead>
                <TableHead>Loại học phần</TableHead>
                <TableHead>Tên Ngành</TableHead>
                <TableHead>Năm</TableHead>
                <TableHead>Học Kỳ</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayCourses.map((course) => (
                <TableRow key={course.id || `${course.name}-${course.major}-${course.semester}-${course.year}`}>
                  <TableCell className="font-medium">
                    <HoverCard openDelay={120} closeDelay={120}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 text-left hover:underline"
                          onMouseEnter={() => loadCourseInstructors(course.id)}
                          onFocus={() => loadCourseInstructors(course.id)}
                          onClick={() => loadCourseInstructors(course.id)}
                        >
                          <BookOpen className="h-4 w-4 text-primary" />
                          <span>{course.name}</span>
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-[360px]">
                        <div className="space-y-2">
                          <p className="text-sm font-semibold">Giảng viên phụ trách môn</p>
                          {loadingCourseInstructorId === course.id ? (
                            <p className="text-sm text-muted-foreground">Đang tải dữ liệu...</p>
                          ) : (instructorsByCourse[course.id || 0] || []).length === 0 ? (
                            <p className="text-sm text-muted-foreground">Chưa có giảng viên phụ trách môn này.</p>
                          ) : (
                            <div className="space-y-2">
                              {(instructorsByCourse[course.id || 0] || []).map((instructor) => (
                                <div key={`${course.id}-${instructor.code}`} className="rounded-md border p-2">
                                  <p className="text-sm font-medium">{instructor.name}</p>
                                  <p className="text-xs text-muted-foreground">{instructor.position || 'Giảng viên'} • {instructor.department || 'Chưa rõ khoa'}</p>
                                  <p className="text-xs text-muted-foreground">{instructor.email || 'Chưa có email'}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{course.credits}</Badge>
                  </TableCell>
                  <TableCell>{course.periods}</TableCell>
                  <TableCell>
                    <Badge
                      variant="default"
                      className={
                        String(course.type || '').toLowerCase().includes('thực hành')
                          ? 'bg-blue-700 text-white hover:bg-blue-800'
                          : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                      }
                    >
                      {course.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{course.major}</TableCell>
                  <TableCell>{course.year}</TableCell>
                  <TableCell>{course.semester}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditCourseDialog(course)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteCourse(course)}
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
