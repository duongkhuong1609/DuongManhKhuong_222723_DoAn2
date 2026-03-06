"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Edit, Trash2 } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

const initialClasses: any[] = []

export function ClassesModule() {
  const [classes, setClasses] = useState(initialClasses)
  const [searchTerm, setSearchTerm] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newClass, setNewClass] = useState({
    code: "",
    name: "",
    department: "",
    major: "",
    studentCount: "",
    classYear: "1",
    year: "2024",
    semester: "Học kỳ 1"
  })

  useEffect(() => {
    fetch('/api/classes')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setClasses(json.data || [])
          if (!json.data || json.data.length === 0) {
            setLoadError('Không thể tải dữ liệu lớp học. Kiểm tra kết nối cơ sở dữ liệu.')
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
  }, [])

  const filteredClasses = classes.filter(
    (c) =>
      String(c.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(c.major || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(c.department || "").toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAddClass = () => {
    if (newClass.code && newClass.name) {
      setClasses([
        ...classes,
        { ...newClass, id: classes.length + 1, studentCount: parseInt(newClass.studentCount) || 0, classYear: parseInt(newClass.classYear), year: parseInt(newClass.year) }
      ])
      setNewClass({ code: "", name: "", department: "", major: "", studentCount: "", classYear: "1", year: "2024", semester: "Học kỳ 1" })
      setIsAddOpen(false)
    }
  }

  const handleDeleteClass = (id: number) => {
    setClasses(classes.filter((c) => c.id !== id))
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
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="code">Mã lớp</Label>
                  <Input
                    id="code"
                    placeholder="VD: CNTT-K20A"
                    value={newClass.code}
                    onChange={(e) => setNewClass({ ...newClass, code: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="studentCount">Sĩ số</Label>
                  <Input
                    id="studentCount"
                    type="number"
                    placeholder="45"
                    value={newClass.studentCount}
                    onChange={(e) => setNewClass({ ...newClass, studentCount: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">Tên lớp</Label>
                <Input
                  id="name"
                  placeholder="VD: CNTT Khóa 20 - Lớp A"
                  value={newClass.name}
                  onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="department">Khoa/Bộ môn</Label>
                <Select
                  value={newClass.department}
                  onValueChange={(value) => setNewClass({ ...newClass, department: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn khoa/bộ môn" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Công nghệ thông tin">Công nghệ thông tin</SelectItem>
                    <SelectItem value="Khoa học máy tính">Khoa học máy tính</SelectItem>
                    <SelectItem value="Công nghệ phần mềm">Công nghệ phần mềm</SelectItem>
                    <SelectItem value="Hệ thống thông tin">Hệ thống thông tin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="year">Năm học</Label>
                  <Select
                    value={newClass.year}
                    onValueChange={(value) => setNewClass({ ...newClass, year: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn năm" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2024">2024-2025</SelectItem>
                      <SelectItem value="2025">2025-2026</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="semester">Học kỳ</Label>
                  <Select
                    value={newClass.semester}
                    onValueChange={(value) => setNewClass({ ...newClass, semester: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn học kỳ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Học kỳ 1">Học kỳ 1</SelectItem>
                      <SelectItem value="Học kỳ 2">Học kỳ 2</SelectItem>
                      <SelectItem value="Học kỳ hè">Học kỳ hè</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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

      <Card className="border-border/50">
        {loadError && <div className="p-4 text-red-600">{loadError}</div>}
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm lớp học..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Khoa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả khoa</SelectItem>
                <SelectItem value="cntt">Công nghệ thông tin</SelectItem>
                <SelectItem value="khmt">Khoa học máy tính</SelectItem>
                <SelectItem value="cnpm">Công nghệ phần mềm</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên lớp</TableHead>
                <TableHead>Tên ngành</TableHead>
                <TableHead>Khoa</TableHead>
                <TableHead>Năm</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClasses.map((c) => (
                <TableRow key={c.id || `${c.name}-${c.major}-${c.department}-${c.year}`}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.major}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.department}</Badge>
                  </TableCell>
                  <TableCell>{c.year}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteClass(c.id ?? 0)}
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
