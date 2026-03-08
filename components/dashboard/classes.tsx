"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Check, ChevronsUpDown, Edit, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

interface ClassItem {
  id?: number
  name: string
  major: string
  department: string
  year: number
  nienKhoa: string
  status: string
}

interface DepartmentOption {
  id: string
  name: string
}

interface MajorOption {
  id: string
  name: string
  departmentId: string
}

interface ClassEditState {
  id: number
  name: string
  majorId: string
  cohortStartYear: string
  status: string
}

const initialClasses: ClassItem[] = []

const normalizeVietnameseText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")

const buildMajorAbbreviation = (majorName: string) => {
  return normalizeVietnameseText(majorName)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() || "")
    .join("")
}

const resolveClassYear = (inputYear: unknown, nienKhoa: string) => {
  const currentYear = new Date().getFullYear()
  const parsedYear = Number(inputYear)
  if (!Number.isNaN(parsedYear) && parsedYear >= 1 && parsedYear <= 4) {
    return parsedYear
  }

  const startYear = Number((String(nienKhoa || '').split('-')[0] || '').trim())
  if (!Number.isNaN(startYear)) {
    return Math.max(1, Math.min(4, currentYear - startYear))
  }

  return 1
}

export function ClassesModule() {
  const currentYear = new Date().getFullYear()
  const [classes, setClasses] = useState(initialClasses)
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [majors, setMajors] = useState<MajorOption[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDepartmentMajorFilter, setSelectedDepartmentMajorFilter] = useState("")
  const [selectedAcademicYearStart, setSelectedAcademicYearStart] = useState(String(currentYear - 1))
  const [selectedNienKhoaStartFilter, setSelectedNienKhoaStartFilter] = useState("")
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("")
  const [openDepartmentMajorFilterPopover, setOpenDepartmentMajorFilterPopover] = useState(false)
  const [openNienKhoaFilterPopover, setOpenNienKhoaFilterPopover] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isAddDepartmentMajorOpen, setIsAddDepartmentMajorOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingClass, setEditingClass] = useState<ClassEditState | null>(null)
  const [openDepartmentPopover, setOpenDepartmentPopover] = useState(false)
  const [openMajorPopover, setOpenMajorPopover] = useState(false)
  const [openDepartmentForMajorPopover, setOpenDepartmentForMajorPopover] = useState(false)
  const [newDepartmentName, setNewDepartmentName] = useState("")
  const [newMajorName, setNewMajorName] = useState("")
  const [selectedDepartmentForMajor, setSelectedDepartmentForMajor] = useState("")
  const [newClass, setNewClass] = useState({
    departmentId: "",
    majorId: "",
    cohortStartYear: String(new Date().getFullYear()),
    classNumber: "01",
  })

  const loadClasses = () => {
    fetch('/api/classes')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          const mappedClasses = (json.data || []).map((item: any) => {
            const nienKhoa = String(item.nienKhoa || item.NienKhoa || '').trim()
            return {
              ...item,
              nienKhoa,
              year: resolveClassYear(item.year ?? item.nam ?? item.Nam, nienKhoa),
            }
          })

          setClasses(mappedClasses)
          if (!json.data || json.data.length === 0) {
            setLoadError('Không thể tải dữ liệu lớp học. Kiểm tra kết nối cơ sở dữ liệu.')
          } else {
            setLoadError(null)
          }
        } else {
          setLoadError(json.error || 'Lỗi không xác định khi tải lớp học')
          setClasses([])
        }
      })
      .catch(err => {
        console.error('Error loading classes:', err)
        setLoadError(err.message || 'Lỗi khi gọi API')
        setClasses([])
      })
  }

  const loadClassOptions = () => {
    fetch('/api/classes/options')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setDepartments(json.data?.departments || [])
          setMajors(json.data?.majors || [])
        }
      })
      .catch(err => {
        console.error('Error loading class options:', err)
      })
  }

  useEffect(() => {
    loadClasses()
    loadClassOptions()
  }, [])

  const filteredMajors = majors.filter((major) => major.departmentId === newClass.departmentId)
  const selectedDepartment = departments.find((department) => department.id === newClass.departmentId)
  const selectedMajor = majors.find((major) => major.id === newClass.majorId)
  const selectedDepartmentForMajorName = departments.find((d) => d.id === selectedDepartmentForMajor)?.name

  const editingMajor = majors.find((major) => major.id === (editingClass?.majorId || ''))
  const editingDepartment = departments.find((department) => department.id === (editingMajor?.departmentId || ''))

  const cohortStartYear = Number(newClass.cohortStartYear)
  const nienKhoaValue = `${cohortStartYear}-${cohortStartYear + 4}`
  const activeAcademicYearStart = Number(selectedAcademicYearStart)
  const classYearValue = Math.max(1, Math.min(4, activeAcademicYearStart - cohortStartYear + 1))

  const classNumberValue = String(parseInt(newClass.classNumber || '1', 10) || 1).padStart(2, '0')
  const classNamePreview = selectedMajor
    ? `DH${String(cohortStartYear).slice(-2)}${buildMajorAbbreviation(selectedMajor.name)}${classNumberValue}`
    : ''

  const addCohortStartOptions = Array.from({ length: 4 }, (_, index) => activeAcademicYearStart - index)
  const academicYearOptions = [currentYear - 1, currentYear]
  const editCohortStartOptions = Array.from({ length: 4 }, (_, index) => activeAcademicYearStart - index)
  const nienKhoaFilterYearOptions = Array.from({ length: 5 }, (_, index) => currentYear - index)
  const nienKhoaFilterOptions = nienKhoaFilterYearOptions.map((year) => ({
    startYear: String(year),
    label: `${year}-${year + 4}`,
  }))
  const statusFilterOptions = ["Chưa tốt nghiệp", "Đã tốt nghiệp"]
  const combinedDepartmentMajorFilterOptions = [
    ...departments.map((department) => ({
      value: `department:${department.name}`,
      label: `Khoa: ${department.name}`,
    })),
    ...majors.map((major) => {
      const department = departments.find((item) => item.id === major.departmentId)
      return {
        value: `major:${major.name}`,
        label: `Ngành: ${major.name} (${department?.name || 'Chưa xác định'})`,
      }
    }),
  ]

  const selectedDepartmentMajorFilterLabel = combinedDepartmentMajorFilterOptions.find(
    (item) => item.value === selectedDepartmentMajorFilter
  )?.label

  const filteredClasses = classes.filter(
    (c) => String(c.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  )

  const visibleClasses = filteredClasses.filter((c) => {
    const matchesDepartmentMajor = !selectedDepartmentMajorFilter
      || (selectedDepartmentMajorFilter.startsWith('department:')
        ? c.department === selectedDepartmentMajorFilter.replace('department:', '')
        : c.major === selectedDepartmentMajorFilter.replace('major:', ''))
    const classStartYear = String(c.nienKhoa || '').split('-')[0]?.trim()
    const matchesNienKhoa = !selectedNienKhoaStartFilter || classStartYear === selectedNienKhoaStartFilter
    const matchesStatus = !selectedStatusFilter || c.status === selectedStatusFilter

    return matchesDepartmentMajor && matchesNienKhoa && matchesStatus
  })

  const handleAddClass = async () => {
    if (!newClass.departmentId || !newClass.majorId || !newClass.cohortStartYear || !newClass.classNumber) {
      alert('Vui lòng nhập đầy đủ thông tin lớp học')
      return
    }

    if (!classNamePreview) {
      alert('Không thể tạo tên lớp, vui lòng chọn lại ngành')
      return
    }

    const minAllowedStartYear = activeAcademicYearStart - 3
    if (cohortStartYear < minAllowedStartYear || cohortStartYear > activeAcademicYearStart) {
      alert(`Niên khóa chỉ được chọn trong khoảng từ ${minAllowedStartYear}-${minAllowedStartYear + 4} đến ${activeAcademicYearStart}-${activeAcademicYearStart + 4}`)
      return
    }

    const confirmMessage = `Xác nhận thêm lớp học mới:\n- Tên lớp: ${classNamePreview}\n- Khoa: ${selectedDepartment?.name || ''}\n- Ngành: ${selectedMajor?.name || ''}\n- Niên khóa: ${nienKhoaValue}\n- Năm lớp: ${classYearValue}\n- Trạng thái: Chưa tốt nghiệp`
    const shouldCreate = confirm(confirmMessage)
    if (!shouldCreate) return

    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maNganh: newClass.majorId,
          tenLop: classNamePreview,
          nam: classYearValue,
          nienKhoa: nienKhoaValue,
          trangThai: 'Chưa tốt nghiệp',
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Thêm lớp học thất bại')
        return
      }

      alert('Thêm lớp học thành công')
      setNewClass({
        departmentId: '',
        majorId: '',
        cohortStartYear: String(new Date().getFullYear()),
        classNumber: '01',
      })
      setIsAddOpen(false)
      setOpenDepartmentPopover(false)
      setOpenMajorPopover(false)
      loadClasses()
    } catch (error) {
      console.error('Error creating class:', error)
      alert('Lỗi khi thêm lớp học')
    }
  }

  const handleAcademicYearChange = async (value: string) => {
    if (value === selectedAcademicYearStart) return

    const selectedStart = Number(value)
    const shouldUpdate = confirm(
      `Xác nhận chuyển năm học sang ${selectedStart}-${selectedStart + 1}?\nHệ thống sẽ cập nhật Năm và Trạng thái của toàn bộ lớp học theo Niên khóa.`
    )

    if (!shouldUpdate) return

    try {
      const res = await fetch('/api/classes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateAcademicYear',
          academicYearStart: selectedStart,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Cập nhật năm học thất bại')
        return
      }

      setSelectedAcademicYearStart(value)
      alert('Cập nhật năm học thành công')
      loadClasses()
    } catch (error) {
      console.error('Error updating academic year:', error)
      alert('Lỗi khi cập nhật năm học')
    }
  }

  const handleAddDepartment = async () => {
    const name = newDepartmentName.trim()
    if (!name) {
      alert('Vui lòng nhập tên khoa')
      return
    }

    try {
      const res = await fetch('/api/classes/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createDepartment', departmentName: name }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Thêm khoa thất bại')
        return
      }

      alert('Thêm khoa thành công')
      setNewDepartmentName('')
      if (json.data?.id) {
        setSelectedDepartmentForMajor(String(json.data.id))
      }
      loadClassOptions()
    } catch (error) {
      console.error('Error creating department:', error)
      alert('Lỗi khi thêm khoa')
    }
  }

  const handleAddMajor = async () => {
    const name = newMajorName.trim()
    if (!selectedDepartmentForMajor || !name) {
      alert('Vui lòng chọn khoa và nhập tên ngành')
      return
    }

    try {
      const res = await fetch('/api/classes/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createMajor',
          departmentId: selectedDepartmentForMajor,
          majorName: name,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Thêm ngành thất bại')
        return
      }

      alert('Thêm ngành thành công')
      setNewMajorName('')
      loadClassOptions()
    } catch (error) {
      console.error('Error creating major:', error)
      alert('Lỗi khi thêm ngành')
    }
  }

  const handleOpenEditClass = (classItem: ClassItem) => {
    if (!classItem.id) {
      alert('Không thể sửa lớp này do thiếu mã lớp')
      return
    }

    const majorMatch = majors.find((major) => major.name === classItem.major)
    if (!majorMatch) {
      alert('Không tìm thấy ngành tương ứng để chỉnh sửa lớp này')
      return
    }

    const startYear = String(classItem.nienKhoa || '').split('-')[0]?.trim()
    const parsedStartYear = Number(startYear)
    const minAllowedStartYear = activeAcademicYearStart - 3
    const normalizedStartYear = Number.isNaN(parsedStartYear)
      ? activeAcademicYearStart
      : Math.max(minAllowedStartYear, Math.min(activeAcademicYearStart, parsedStartYear))
    const validStartYear = String(normalizedStartYear)

    setEditingClass({
      id: classItem.id,
      name: classItem.name,
      majorId: majorMatch.id,
      cohortStartYear: validStartYear,
      status: classItem.status || 'Chưa tốt nghiệp',
    })
    setIsEditOpen(true)
  }

  const handleUpdateClass = async () => {
    if (!editingClass) return

    if (!editingClass.name.trim() || !editingClass.majorId || !editingClass.cohortStartYear || !editingClass.status) {
      alert('Vui lòng nhập đầy đủ thông tin lớp học')
      return
    }

    const startYear = Number(editingClass.cohortStartYear)
    const minAllowedStartYear = activeAcademicYearStart - 3
    if (startYear < minAllowedStartYear || startYear > activeAcademicYearStart) {
      alert(`Niên khóa chỉ được chọn trong khoảng từ ${minAllowedStartYear}-${minAllowedStartYear + 4} đến ${activeAcademicYearStart}-${activeAcademicYearStart + 4}`)
      return
    }

    const nienKhoa = `${startYear}-${startYear + 4}`
    const nam = Math.max(1, Math.min(4, activeAcademicYearStart - startYear + 1))

    const shouldUpdate = confirm(
      `Xác nhận cập nhật lớp học:\n- Tên lớp: ${editingClass.name}\n- Khoa: ${editingDepartment?.name || ''}\n- Ngành: ${editingMajor?.name || ''}\n- Niên khóa: ${nienKhoa}\n- Năm lớp: ${nam}\n- Trạng thái: ${editingClass.status}`
    )
    if (!shouldUpdate) return

    try {
      const res = await fetch('/api/classes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingClass.id,
          maNganh: editingClass.majorId,
          tenLop: editingClass.name.trim(),
          nam,
          nienKhoa,
          trangThai: editingClass.status,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Cập nhật lớp học thất bại')
        return
      }

      alert('Cập nhật lớp học thành công')
      setIsEditOpen(false)
      setEditingClass(null)
      loadClasses()
    } catch (error) {
      console.error('Error updating class:', error)
      alert('Lỗi khi cập nhật lớp học')
    }
  }

  const handleDeleteClass = async (classItem: ClassItem) => {
    if (!classItem.id) {
      alert('Không thể xóa lớp này do thiếu mã lớp')
      return
    }

    const shouldDelete = confirm(`Xác nhận xóa lớp học ${classItem.name}?`)
    if (!shouldDelete) return

    try {
      const res = await fetch(`/api/classes?id=${classItem.id}`, { method: 'DELETE' })
      const json = await res.json()

      if (!res.ok || !json.success) {
        alert(json.error || 'Xóa lớp học thất bại')
        return
      }

      alert('Xóa lớp học thành công')
      loadClasses()
    } catch (error) {
      console.error('Error deleting class:', error)
      alert('Lỗi khi xóa lớp học')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Quản lý Lớp học</h2>
          <p className="text-muted-foreground">
            Quản lý danh sách lớp học theo khoa và khóa học
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedAcademicYearStart} onValueChange={handleAcademicYearChange}>
            <SelectTrigger className="w-[170px] bg-green-600 text-white hover:bg-green-700 focus:ring-green-600 [&>svg]:text-white">
              <span className="truncate text-left">
                {`Chọn năm học: ${selectedAcademicYearStart}-${Number(selectedAcademicYearStart) + 1}`}
              </span>
            </SelectTrigger>
            <SelectContent>
              {academicYearOptions.map((yearStart) => (
                <SelectItem key={yearStart} value={String(yearStart)}>{yearStart}-{yearStart + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={isAddDepartmentMajorOpen} onOpenChange={setIsAddDepartmentMajorOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Thêm khoa/ngành
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle>Thêm khoa/ngành</DialogTitle>
              </DialogHeader>
              <div className="grid gap-6 py-4">
                <div className="grid gap-3 rounded-md border p-4">
                  <Label className="font-medium">Thêm khoa mới</Label>
                  <div className="grid gap-2">
                    <Label htmlFor="new-department-name">Tên khoa (TenKhoa)</Label>
                    <Input
                      id="new-department-name"
                      placeholder="VD: Khoa Công nghệ thông tin"
                      value={newDepartmentName}
                      onChange={(e) => setNewDepartmentName(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleAddDepartment}>Lưu khoa</Button>
                  </div>
                </div>

                <div className="grid gap-3 rounded-md border p-4">
                  <Label className="font-medium">Thêm ngành cho khoa</Label>
                  <div className="grid gap-2">
                    <Label>Chọn khoa có sẵn</Label>
                    <Popover open={openDepartmentForMajorPopover} onOpenChange={setOpenDepartmentForMajorPopover}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openDepartmentForMajorPopover}
                          className="w-full justify-between"
                          title={selectedDepartmentForMajorName || 'Chọn khoa'}
                        >
                          <span className="min-w-0 flex-1 truncate text-left">
                            {selectedDepartmentForMajorName || 'Chọn khoa'}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Tìm kiếm khoa..." />
                          <CommandList>
                            <CommandEmpty>Không tìm thấy khoa.</CommandEmpty>
                            <CommandGroup>
                              {departments.map((department) => (
                                <CommandItem
                                  key={department.id}
                                  value={department.name}
                                  onSelect={() => {
                                    setSelectedDepartmentForMajor(department.id)
                                    setOpenDepartmentForMajorPopover(false)
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedDepartmentForMajor === department.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {department.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="new-major-name">Tên ngành (TenNganh)</Label>
                    <Input
                      id="new-major-name"
                      placeholder="VD: Kỹ thuật phần mềm"
                      value={newMajorName}
                      onChange={(e) => setNewMajorName(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleAddMajor}>Lưu ngành</Button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Đóng</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Thêm lớp học
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Thêm lớp học mới</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="department">Khoa/Bộ môn</Label>
                <Popover open={openDepartmentPopover} onOpenChange={setOpenDepartmentPopover}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openDepartmentPopover}
                      className="w-full justify-between"
                    >
                      {selectedDepartment?.name || "Chọn khoa/bộ môn"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Tìm kiếm khoa..." />
                      <CommandList>
                        <CommandEmpty>Không tìm thấy khoa.</CommandEmpty>
                        <CommandGroup>
                          {departments.map((department) => (
                            <CommandItem
                              key={department.id}
                              value={department.name}
                              onSelect={() => {
                                setNewClass({ ...newClass, departmentId: department.id, majorId: '' })
                                setOpenDepartmentPopover(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  newClass.departmentId === department.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {department.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="major">Ngành</Label>
                <Popover open={openMajorPopover} onOpenChange={setOpenMajorPopover}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openMajorPopover}
                      className="w-full justify-between"
                      disabled={!newClass.departmentId}
                    >
                      {selectedMajor?.name || "Chọn ngành"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Tìm kiếm ngành..." />
                      <CommandList>
                        <CommandEmpty>Không tìm thấy ngành.</CommandEmpty>
                        <CommandGroup>
                          {filteredMajors.map((major) => (
                            <CommandItem
                              key={major.id}
                              value={major.name}
                              onSelect={() => {
                                setNewClass({ ...newClass, majorId: major.id })
                                setOpenMajorPopover(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  newClass.majorId === major.id ? "opacity-100" : "opacity-0"
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
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cohort">Niên khóa</Label>
                  <Select
                    value={newClass.cohortStartYear}
                    onValueChange={(value) => setNewClass({ ...newClass, cohortStartYear: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn niên khóa" />
                    </SelectTrigger>
                    <SelectContent>
                      {addCohortStartOptions.map((year) => (
                        <SelectItem key={year} value={String(year)}>
                          {year}-{year + 4}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="class-number">Số lớp</Label>
                <Input
                  id="class-number"
                  type="number"
                  min="1"
                  placeholder="VD: 03"
                  value={newClass.classNumber}
                  onChange={(e) => setNewClass({ ...newClass, classNumber: e.target.value })}
                />
              </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">Tên lớp (tự tạo)</Label>
                <Input id="name" value={classNamePreview} placeholder="VD: DH22CNTT03" disabled />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Niên khóa đã chọn</Label>
                  <Input value={nienKhoaValue} disabled />
                </div>
                <div className="grid gap-2">
                  <Label>Năm của lớp</Label>
                  <Input value={`Năm ${classYearValue}`} disabled />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Trạng thái</Label>
                <Input value="Chưa tốt nghiệp" disabled />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Hủy</Button>
              </DialogClose>
              <Button onClick={handleAddClass}>Thêm lớp học</Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        </div>
        <Dialog
          open={isEditOpen}
          onOpenChange={(open) => {
            setIsEditOpen(open)
            if (!open) setEditingClass(null)
          }}
        >
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Chỉnh sửa lớp học</DialogTitle>
            </DialogHeader>
            {editingClass ? (
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Tên lớp</Label>
                  <Input
                    value={editingClass.name}
                    onChange={(e) => setEditingClass({ ...editingClass, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Ngành</Label>
                  <Select
                    value={editingClass.majorId}
                    onValueChange={(value) => setEditingClass({ ...editingClass, majorId: value })}
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
                  <Label>Khoa/Bộ môn</Label>
                  <Input value={editingDepartment?.name || ''} disabled />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Niên khóa</Label>
                    <Select
                      value={editingClass.cohortStartYear}
                      onValueChange={(value) => setEditingClass({ ...editingClass, cohortStartYear: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn niên khóa" />
                      </SelectTrigger>
                      <SelectContent>
                        {editCohortStartOptions.map((year) => (
                          <SelectItem key={year} value={String(year)}>
                            {year}-{year + 4}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Năm lớp</Label>
                    <Input
                      value={`Năm ${Math.max(1, Math.min(4, activeAcademicYearStart - Number(editingClass.cohortStartYear) + 1))}`}
                      disabled
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Trạng thái</Label>
                  <Select
                    value={editingClass.status}
                    onValueChange={(value) => setEditingClass({ ...editingClass, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn trạng thái" />
                    </SelectTrigger>
                    <SelectContent>
                      {statusFilterOptions.map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Hủy</Button>
              </DialogClose>
              <Button onClick={handleUpdateClass}>Lưu thay đổi</Button>
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
                placeholder="Tìm kiếm theo tên lớp..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Popover open={openDepartmentMajorFilterPopover} onOpenChange={setOpenDepartmentMajorFilterPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openDepartmentMajorFilterPopover}
                  className="w-[250px] justify-between"
                  title={selectedDepartmentMajorFilterLabel || "Lọc theo khoa/ngành"}
                >
                  <span className="min-w-0 flex-1 truncate text-left">
                    {selectedDepartmentMajorFilterLabel || "Lọc theo khoa/ngành"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[250px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Tìm kiếm khoa/ngành..." />
                  <CommandList>
                    <CommandEmpty>Không tìm thấy khoa/ngành.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="all"
                        onSelect={() => {
                          setSelectedDepartmentMajorFilter('')
                          setOpenDepartmentMajorFilterPopover(false)
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedDepartmentMajorFilter === '' ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        Tất cả khoa/ngành
                      </CommandItem>
                      {combinedDepartmentMajorFilterOptions.map((option) => (
                        <CommandItem
                          key={option.value}
                          value={option.label}
                          onSelect={() => {
                            setSelectedDepartmentMajorFilter(
                              selectedDepartmentMajorFilter === option.value ? '' : option.value
                            )
                            setOpenDepartmentMajorFilterPopover(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedDepartmentMajorFilter === option.value ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate" title={option.label}>
                            {option.label}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Popover open={openNienKhoaFilterPopover} onOpenChange={setOpenNienKhoaFilterPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openNienKhoaFilterPopover}
                  className="w-[220px] justify-between"
                >
                  {selectedNienKhoaStartFilter
                    ? `${selectedNienKhoaStartFilter}-${Number(selectedNienKhoaStartFilter) + 4}`
                    : "Lọc theo niên khóa"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Tìm theo năm bắt đầu..." />
                  <CommandList>
                    <CommandEmpty>Không tìm thấy niên khóa.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="all"
                        onSelect={() => {
                          setSelectedNienKhoaStartFilter('')
                          setOpenNienKhoaFilterPopover(false)
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedNienKhoaStartFilter === '' ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        Tất cả niên khóa
                      </CommandItem>
                      {nienKhoaFilterOptions.map((option) => (
                        <CommandItem
                          key={option.startYear}
                          value={`${option.startYear} ${option.label}`}
                          onSelect={() => {
                            setSelectedNienKhoaStartFilter(
                              selectedNienKhoaStartFilter === option.startYear ? '' : option.startYear
                            )
                            setOpenNienKhoaFilterPopover(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedNienKhoaStartFilter === option.startYear ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          {option.label}
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
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Lọc theo trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                {statusFilterOptions.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto">
              <Badge variant="secondary" className="text-sm font-medium">
                Tổng lớp học: {visibleClasses.length}/{classes.length}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên lớp</TableHead>
                <TableHead>Tên ngành</TableHead>
                <TableHead>Khoa</TableHead>
                <TableHead>Niên khóa</TableHead>
                <TableHead>Năm</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleClasses.map((c) => (
                <TableRow key={c.id || `${c.name}-${c.major}-${c.department}-${c.year}`}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.major}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.department}</Badge>
                  </TableCell>
                  <TableCell>{c.nienKhoa}</TableCell>
                  <TableCell>{`Năm ${c.year}`}</TableCell>
                  <TableCell>
                    <Badge
                      variant="default"
                      className={c.status === 'Đã tốt nghiệp' ? 'bg-green-600 text-white hover:bg-green-700' : undefined}
                    >
                      {c.status || 'Chưa tốt nghiệp'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleOpenEditClass(c)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteClass(c)}
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
