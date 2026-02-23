"use client"

import { useState } from "react"
import { Plus, Search, Edit, Trash2, Clock, BookOpen, ChevronsUpDown, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
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

const initialCourses = [
  { id: 1, code: "IT101", name: "Cơ sở dữ liệu", credits: 3, theoryHours: 30, practiceHours: 15, department: "Công nghệ thông tin", type: "Lý thuyết" },
  { id: 2, code: "IT102", name: "Lập trình web", credits: 3, theoryHours: 30, practiceHours: 30, department: "Công nghệ thông tin", type: "Thực hành" },
  { id: 3, code: "IT201", name: "Trí tuệ nhân tạo", credits: 3, theoryHours: 45, practiceHours: 0, department: "Khoa học máy tính", type: "Lý thuyết" },
  { id: 4, code: "IT202", name: "Mạng máy tính", credits: 3, theoryHours: 30, practiceHours: 15, department: "Mạng và truyền thông", type: "Thực hành" },
  { id: 5, code: "IT301", name: "Công nghệ phần mềm", credits: 4, theoryHours: 45, practiceHours: 30, department: "Công nghệ phần mềm", type: "Lý thuyết" },
]

const departments = [
  "Công nghệ thông tin",
  "Khoa học máy tính",
  "Công nghệ phần mềm",
  "Mạng và truyền thông",
]

export function CoursesModule() {
  const [courses, setCourses] = useState(initialCourses)
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [selectedDepartment, setSelectedDepartment] = useState("")
  const [openDepartmentPopover, setOpenDepartmentPopover] = useState(false)
  const [newCourse, setNewCourse] = useState({
    code: "",
    name: "",
    credits: "",
    theoryHours: "",
    practiceHours: "",
    department: "",
    type: "Lý thuyết"
  })

  const filteredCourses = courses.filter(
    (course) => {
      const matchesSearch =
        course.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.department.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesDepartment = selectedDepartment === "" || course.department === selectedDepartment
      
      return matchesSearch && matchesDepartment
    }
  )

  const handleAddCourse = () => {
    if (newCourse.code && newCourse.name) {
      setCourses([
        ...courses,
        { 
          ...newCourse, 
          id: courses.length + 1, 
          credits: parseInt(newCourse.credits) || 0,
          theoryHours: parseInt(newCourse.theoryHours) || 0,
          practiceHours: parseInt(newCourse.practiceHours) || 0
        }
      ])
      setNewCourse({ code: "", name: "", credits: "", theoryHours: "", practiceHours: "", department: "", type: "Lý thuyết" })
      setIsAddOpen(false)
    }
  }

  const handleDeleteCourse = (id: number) => {
    setCourses(courses.filter((c) => c.id !== id))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Quản lý Môn học</h2>
          <p className="text-muted-foreground">
            Quản lý danh sách môn học, số tín chỉ và giờ học
          </p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="code">Mã môn</Label>
                  <Input
                    id="code"
                    placeholder="VD: IT101"
                    value={newCourse.code}
                    onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="credits">Số tín chỉ</Label>
                  <Input
                    id="credits"
                    type="number"
                    placeholder="3"
                    value={newCourse.credits}
                    onChange={(e) => setNewCourse({ ...newCourse, credits: e.target.value })}
                  />
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
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="theoryHours">Giờ lý thuyết</Label>
                  <Input
                    id="theoryHours"
                    type="number"
                    placeholder="30"
                    value={newCourse.theoryHours}
                    onChange={(e) => setNewCourse({ ...newCourse, theoryHours: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="practiceHours">Giờ thực hành</Label>
                  <Input
                    id="practiceHours"
                    type="number"
                    placeholder="15"
                    value={newCourse.practiceHours}
                    onChange={(e) => setNewCourse({ ...newCourse, practiceHours: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="department">Khoa/Bộ môn</Label>
                  <Select
                    value={newCourse.department}
                    onValueChange={(value) => setNewCourse({ ...newCourse, department: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn khoa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Công nghệ thông tin">Công nghệ thông tin</SelectItem>
                      <SelectItem value="Khoa học máy tính">Khoa học máy tính</SelectItem>
                      <SelectItem value="Công nghệ phần mềm">Công nghệ phần mềm</SelectItem>
                      <SelectItem value="Mạng và truyền thông">Mạng và truyền thông</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="type">Loại môn</Label>
                  <Select
                    value={newCourse.type}
                    onValueChange={(value) => setNewCourse({ ...newCourse, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn loại" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Lý thuyết">Lý thuyết</SelectItem>
                      <SelectItem value="Thực hành">Thực hành</SelectItem>
                    </SelectContent>
                  </Select>
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
      </div>

      <Card className="border-border/50">
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
            <Popover open={openDepartmentPopover} onOpenChange={setOpenDepartmentPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openDepartmentPopover}
                  className="w-[180px] justify-between"
                >
                  {selectedDepartment || "Chọn khoa..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[180px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Tìm kiếm khoa..." />
                  <CommandEmpty>Không tìm thấy khoa.</CommandEmpty>
                  <CommandList>
                    <CommandGroup>
                      <CommandItem
                        value="all"
                        onSelect={() => {
                          setSelectedDepartment("")
                          setOpenDepartmentPopover(false)
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedDepartment === "" ? "opacity-100" : "opacity-0"
                          )}
                        />
                        Tất cả
                      </CommandItem>
                      {departments.map((dept) => (
                        <CommandItem
                          key={dept}
                          value={dept}
                          onSelect={(currentValue) => {
                            setSelectedDepartment(currentValue === selectedDepartment ? "" : currentValue)
                            setOpenDepartmentPopover(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedDepartment === dept ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {dept}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Select defaultValue="all">
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Loại" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="theory">Lý thuyết</SelectItem>
                <SelectItem value="practice">Thực hành</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên môn học</TableHead>
                <TableHead>Tín chỉ</TableHead>
                <TableHead>Số tiết học</TableHead>
                <TableHead>Khoa/Bộ môn</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCourses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      {course.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{course.credits} TC</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {course.theoryHours + course.practiceHours} tiết
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{course.department}</TableCell>
                  <TableCell>
                    <Badge variant={course.type === "Lý thuyết" ? "default" : "secondary"}>
                      {course.type}
                    </Badge>
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
                        onClick={() => handleDeleteCourse(course.id)}
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
