"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Edit, Trash2, Mail } from "lucide-react"
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const initialInstructors: any[] = []

interface Instructor {
  id?: number // only used locally for added entries
  code: string
  name: string
  email: string
  position: string
  department: string
  status: string
}

export function InstructorsModule() {
  const [instructors, setInstructors] = useState(initialInstructors)
  const [searchTerm, setSearchTerm] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)

  // fetch instructors from API once when component mounts
  useEffect(() => {
    fetch('/api/instructors')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setInstructors(json.data)
          if (!json.data || json.data.length === 0) {
            setLoadError('Không thể tải dữ liệu giảng viên. Kiểm tra kết nối cơ sở dữ liệu.')
          }
        } else {
          setLoadError(json.error || 'Lỗi không xác định khi tải giảng viên')
        }
      })
      .catch(err => {
        console.error('Error loading instructors:', err)
        setLoadError(err.message || 'Lỗi khi gọi API')
      })
  }, [])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [selectedInstructor, setSelectedInstructor] = useState<Instructor | null>(null)
  const [newInstructor, setNewInstructor] = useState<Partial<Instructor>>({
    code: "",
    name: "",
    email: "",
    department: "",
    position: "",
    status: "",
  })

  const filteredInstructors = instructors.filter(
    (instructor) =>
      String(instructor.code)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instructor.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instructor.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      instructor.department?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const sortedInstructors = [...filteredInstructors].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "vi", { sensitivity: "base" })
  )

  // derive list of departments (TenKhoa) for selects
  const departmentOptions = Array.from(
    new Set(instructors.map(i => i.department).filter(Boolean))
  ) as string[];

  const handleAddInstructor = () => {
    if (newInstructor.name && newInstructor.email && newInstructor.code) {
      setInstructors([
        ...instructors,
        { 
          ...newInstructor as Instructor, 
          id: Date.now() // temporary id
        }
      ])
      setNewInstructor({
        code: "",
        name: "",
        email: "",
        department: "",
        position: "",
        status: "",
      })
      setIsAddOpen(false)
    }
  }

  const handleEditInstructor = (instructor: Instructor) => {
    setSelectedInstructor(instructor)
    setNewInstructor(instructor)
    setIsEditOpen(true)
  }

  const handleUpdateInstructor = () => {
    if (selectedInstructor && newInstructor.name && newInstructor.email) {
      setInstructors(
        instructors.map((i) =>
          i.code === selectedInstructor.code
            ? { ...(newInstructor as Instructor) }
            : i
        )
      )
      setIsEditOpen(false)
      setSelectedInstructor(null)
      setNewInstructor({
        code: "",
        name: "",
        email: "",
        department: "",
        position: "",
        status: "",
      })
    }
  }

  const handleDeleteInstructor = () => {
    if (selectedInstructor) {
      setInstructors(instructors.filter((i) => i.code !== selectedInstructor.code))
      setDeleteConfirmOpen(false)
      setSelectedInstructor(null)
    }
  }

  const openDeleteConfirm = (instructor: Instructor) => {
    setSelectedInstructor(instructor)
    setDeleteConfirmOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Quản lý Giảng viên</h2>
          <p className="text-muted-foreground">
            Thêm, sửa, xóa thông tin giảng viên trong hệ thống
          </p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="code">Mã giảng viên</Label>
                  <Input
                    id="code"
                    placeholder="VD: GV001"
                    value={newInstructor.code}
                    onChange={(e) => setNewInstructor({ ...newInstructor, code: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="name">Họ và tên</Label>
                  <Input
                    id="name"
                    placeholder="VD: PGS.TS. Nguyễn Văn A"
                    value={newInstructor.name}
                    onChange={(e) => setNewInstructor({ ...newInstructor, name: e.target.value })}
                  />
                </div>
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
                  <Select
                    value={newInstructor.department}
                    onValueChange={(value) => setNewInstructor({ ...newInstructor, department: value })}
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
                  <Label htmlFor="position">Chức vụ</Label>
                  <Select
                    value={newInstructor.position}
                    onValueChange={(value) => setNewInstructor({ ...newInstructor, position: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn chức vụ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Giảng viên">Giảng viên</SelectItem>
                      <SelectItem value="Thạc sĩ">Thạc sĩ</SelectItem>
                      <SelectItem value="Tiến sĩ">Tiến sĩ</SelectItem>
                      <SelectItem value="Phó Giáo sư">Phó Giáo sư</SelectItem>
                      <SelectItem value="Giáo sư">Giáo sư</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                    <SelectItem value="Tạm nghỉ">Tạm nghỉ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Hủy</Button>
              </DialogClose>
              <Button onClick={handleAddInstructor}>Thêm giảng viên</Button>
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
                placeholder="Tìm kiếm giảng viên..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Lọc theo khoa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả khoa</SelectItem>
                {departmentOptions.map((dep) => (
                  <SelectItem key={dep} value={dep}>{dep}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              {sortedInstructors.map((instructor) => (
                <TableRow key={instructor.code}>
                  <TableCell className="font-medium">{instructor.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {instructor.email}
                    </div>
                  </TableCell>
                  <TableCell>{instructor.position}</TableCell>
                  <TableCell>{instructor.department}</TableCell>
                  <TableCell>
                    <Badge variant={instructor.status === "Có thể dạy" ? "default" : instructor.status === "Tạm nghỉ" ? "secondary" : "outline"}>
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
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => openDeleteConfirm(instructor)}
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

      {/* Dialog sửa giảng viên */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sửa thông tin giảng viên</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-code">Mã giảng viên</Label>
                <Input
                  id="edit-code"
                  disabled
                  value={newInstructor.code}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Họ và tên</Label>
                <Input
                  id="edit-name"
                  value={newInstructor.name}
                  onChange={(e) => setNewInstructor({ ...newInstructor, name: e.target.value })}
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
                  onChange={(e) => setNewInstructor({ ...newInstructor, email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-department">Khoa/Bộ môn</Label>
                <Select
                  value={newInstructor.department}
                  onValueChange={(value) => setNewInstructor({ ...newInstructor, department: value })}
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
                    <SelectItem value="Giảng viên">Giảng viên</SelectItem>
                    <SelectItem value="Thạc sĩ">Thạc sĩ</SelectItem>
                    <SelectItem value="Tiến sĩ">Tiến sĩ</SelectItem>
                    <SelectItem value="Phó Giáo sư">Phó Giáo sư</SelectItem>
                    <SelectItem value="Giáo sư">Giáo sư</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                  <SelectItem value="Tạm nghỉ">Tạm nghỉ</SelectItem>
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

      {/* Alert Dialog xác nhận xóa */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa giảng viên</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa giảng viên <strong>{selectedInstructor?.name}</strong>? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialog>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteInstructor}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialog>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
