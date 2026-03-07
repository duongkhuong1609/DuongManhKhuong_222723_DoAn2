"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Edit, Trash2, Monitor, Check, ChevronsUpDown } from "lucide-react"
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

// component state is populated from the database via API
interface Room {
  code: string // we'll store TenPhong here
  building: string // TenKhu
  type: string // LoaiPhong
  status: string // TrangThai
  id?: number // temporary for local operations if any
}

interface Area {
  id?: number
  name: string
  description?: string
}

export function RoomsModule() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedAreaFilter, setSelectedAreaFilter] = useState("")
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("")
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("")
  const [openAreaFilterPopover, setOpenAreaFilterPopover] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isAddAreaOpen, setIsAddAreaOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [editStatus, setEditStatus] = useState("Có thể sử dụng")
  const [editScope, setEditScope] = useState<"room" | "area">("room")
  const [openAreaPopover, setOpenAreaPopover] = useState(false)
  const [newArea, setNewArea] = useState({
    name: "",
    description: "",
  })

  const loadRooms = () => {
    fetch('/api/rooms')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setRooms(json.data)
          if (!json.data || json.data.length === 0) {
            setLoadError('Không thể tải dữ liệu phòng học. Kiểm tra kết nối cơ sở dữ liệu.')
          } else {
            setLoadError(null)
          }
        } else {
          setLoadError(json.error || 'Lỗi không xác định khi tải phòng học')
        }
      })
      .catch(err => {
        console.error('Error loading rooms:', err)
        setLoadError(err.message || 'Lỗi khi gọi API')
      })
  }

  const loadAreas = () => {
    fetch('/api/areas')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setAreas(json.data || [])
        }
      })
      .catch(err => {
        console.error('Error loading areas:', err)
      })
  }

  // fetch data from API when component mounts
  useEffect(() => {
    loadRooms()
    loadAreas()
  }, [])

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newRoom, setNewRoom] = useState<Partial<Room>>({
    code: "",
    building: "",
    type: "",
    status: "Có thể sử dụng"
  })

  const filteredRooms = rooms.filter((room) => {
    const matchesSearch = String(room.code).toLowerCase().includes(searchTerm.toLowerCase())
    const matchesArea = selectedAreaFilter === "" || room.building === selectedAreaFilter
    const matchesType = selectedTypeFilter === "" || room.type === selectedTypeFilter
    const matchesStatus = selectedStatusFilter === "" || room.status === selectedStatusFilter
    return matchesSearch && matchesArea && matchesType && matchesStatus
  })

  const handleAddRoom = async () => {
    if (!newRoom.code || !newRoom.building || !newRoom.type || !newRoom.status) {
      alert('Vui lòng nhập đầy đủ thông tin phòng học')
      return
    }

    const shouldCreate = confirm(`Xác nhận thêm phòng mới:\n- Tên phòng: ${newRoom.code}\n- Khu: ${newRoom.building}\n- Loại phòng: ${newRoom.type}\n- Trạng thái: ${newRoom.status}`)
    if (!shouldCreate) return

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: newRoom.code,
          building: newRoom.building,
          type: newRoom.type,
          status: newRoom.status,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Thêm phòng học thất bại')
        return
      }

      alert('Thêm phòng học thành công')
      setNewRoom({ code: "", building: "", type: "", status: "Có thể sử dụng" })
      setOpenAreaPopover(false)
      setIsAddOpen(false)
      loadRooms()
    } catch (error) {
      console.error('Error creating room:', error)
      alert('Lỗi khi thêm phòng học')
    }
  }

  const handleOpenEditRoom = (room: Room) => {
    if (!room.id) {
      alert('Không thể chỉnh sửa phòng này do thiếu mã phòng')
      return
    }
    setEditingRoom(room)
    setEditStatus(room.status || 'Có thể sử dụng')
    setEditScope('room')
    setIsEditOpen(true)
  }

  const handleUpdateRoomStatus = async () => {
    if (!editingRoom?.id) {
      alert('Không tìm thấy phòng cần cập nhật')
      return
    }

    if (!editStatus) {
      alert('Vui lòng chọn trạng thái phòng')
      return
    }

    const scopeText = editScope === 'room' ? 'phòng này' : `toàn bộ khu ${editingRoom.building}`
    const shouldUpdate = confirm(`Xác nhận cập nhật trạng thái "${editStatus}" cho ${scopeText}?`)
    if (!shouldUpdate) return

    try {
      const res = await fetch('/api/rooms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: editingRoom.id,
          status: editStatus,
          scope: editScope,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Cập nhật trạng thái phòng thất bại')
        return
      }

      alert(editScope === 'room' ? 'Cập nhật trạng thái phòng thành công' : 'Cập nhật trạng thái cho toàn bộ khu thành công')
      setIsEditOpen(false)
      setEditingRoom(null)
      loadRooms()
    } catch (error) {
      console.error('Error updating room status:', error)
      alert('Lỗi khi cập nhật trạng thái phòng')
    }
  }

  const handleAddArea = async () => {
    if (!newArea.name.trim()) {
      alert('Vui lòng nhập tên khu')
      return
    }

    try {
      const res = await fetch('/api/areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newArea.name,
          description: newArea.description,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Thêm khu thất bại')
        return
      }

      alert('Thêm khu thành công')
      setNewArea({ name: '', description: '' })
      setIsAddAreaOpen(false)
      loadAreas()
      loadRooms()
    } catch (error) {
      console.error('Error creating area:', error)
      alert('Lỗi khi thêm khu')
    }
  }

  const handleDeleteArea = async (area: Area) => {
    if (!area.id) {
      alert('Không thể xóa khu này do thiếu mã khu')
      return
    }

    const shouldDelete = confirm(`Xác nhận xóa khu "${area.name}"?`)
    if (!shouldDelete) return

    try {
      const res = await fetch(`/api/areas?id=${area.id}`, {
        method: 'DELETE',
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Xóa khu thất bại')
        return
      }

      alert('Xóa khu thành công')
      if (newRoom.building === area.name) {
        setNewRoom({ ...newRoom, building: '' })
      }
      if (selectedAreaFilter === area.name) {
        setSelectedAreaFilter('')
      }
      loadAreas()
      loadRooms()
    } catch (error) {
      console.error('Error deleting area:', error)
      alert('Lỗi khi xóa khu')
    }
  }

  const areaOptions = areas.length
    ? areas.map((a) => a.name)
    : Array.from(new Set(rooms.map((r) => r.building).filter(Boolean)))

  const totalRoomCount = rooms.length
  const visibleRoomCount = filteredRooms.length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Quản lý Phòng học</h2>
          <p className="text-muted-foreground">
            Quản lý danh sách phòng học, phòng thực hành và hội trường
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isAddAreaOpen} onOpenChange={setIsAddAreaOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Thêm khu
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[450px]">
              <DialogHeader>
                <DialogTitle>Thêm khu mới</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="area-name">Tên khu</Label>
                  <Input
                    id="area-name"
                    placeholder="VD: Khu A"
                    value={newArea.name}
                    onChange={(e) => setNewArea({ ...newArea, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="area-description">Mô tả</Label>
                  <Input
                    id="area-description"
                    placeholder="Mô tả khu học"
                    value={newArea.description}
                    onChange={(e) => setNewArea({ ...newArea, description: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Danh sách khu hiện có</Label>
                  <div className="max-h-44 overflow-y-auto rounded-md border">
                    {areas.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">Chưa có khu nào</p>
                    ) : (
                      <div className="divide-y">
                        {areas.map((area) => (
                          <div key={area.id ?? area.name} className="flex items-center justify-between p-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{area.name}</p>
                              {area.description ? (
                                <p className="truncate text-xs text-muted-foreground">{area.description}</p>
                              ) : null}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteArea(area)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Hủy</Button>
                </DialogClose>
                <Button onClick={handleAddArea}>Lưu khu</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Thêm phòng học
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Thêm phòng học mới</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="code">Tên phòng học</Label>
                <Input
                  id="code"
                  placeholder="VD: A1-01"
                  value={newRoom.code}
                  onChange={(e) => setNewRoom({ ...newRoom, code: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="building">Chọn khu</Label>
                <Popover open={openAreaPopover} onOpenChange={setOpenAreaPopover}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openAreaPopover}
                      className="w-full justify-between"
                    >
                      {newRoom.building || "Chọn khu"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Tìm kiếm khu..." />
                      <CommandList>
                        <CommandEmpty>Không tìm thấy khu.</CommandEmpty>
                        <CommandGroup>
                          {areaOptions.map((area) => (
                            <CommandItem
                              key={area}
                              value={area}
                              onSelect={() => {
                                setNewRoom({ ...newRoom, building: area })
                                setOpenAreaPopover(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  newRoom.building === area ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {area}
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
                  <Label htmlFor="type">Loại phòng</Label>
                  <Select
                    value={newRoom.type}
                    onValueChange={(value) => setNewRoom({ ...newRoom, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn loại phòng" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Lý thuyết">Lý thuyết</SelectItem>
                      <SelectItem value="Thực hành">Thực hành</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="status">Trạng thái phòng</Label>
                  <Select
                    value={newRoom.status}
                    onValueChange={(value) => setNewRoom({ ...newRoom, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn trạng thái" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Có thể sử dụng">Có thể sử dụng</SelectItem>
                      <SelectItem value="Không thể sử dụng">Không thể sử dụng</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Hủy</Button>
              </DialogClose>
              <Button onClick={handleAddRoom}>Thêm phòng học</Button>
            </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={isEditOpen}
            onOpenChange={(open) => {
              setIsEditOpen(open)
              if (!open) {
                setEditingRoom(null)
                setEditScope('room')
              }
            }}
          >
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Chỉnh sửa trạng thái phòng</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Tên phòng</Label>
                  <Input value={editingRoom?.code || ''} disabled />
                </div>
                <div className="grid gap-2">
                  <Label>Khu học</Label>
                  <Input value={editingRoom?.building || ''} disabled />
                </div>
                <div className="grid gap-2">
                  <Label>Phạm vi cập nhật</Label>
                  <Select
                    value={editScope}
                    onValueChange={(value) => setEditScope(value as "room" | "area")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn phạm vi cập nhật" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="room">Chỉ phòng này</SelectItem>
                      <SelectItem value="area">Toàn bộ khu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Trạng thái phòng</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn trạng thái" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Có thể sử dụng">Có thể sử dụng</SelectItem>
                      <SelectItem value="Không thể sử dụng">Không thể sử dụng</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Hủy</Button>
                </DialogClose>
                <Button onClick={handleUpdateRoomStatus}>Cập nhật</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-border/50">
        {loadError && <div className="p-4 text-red-600">{loadError}</div>}
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm theo tên phòng..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Popover open={openAreaFilterPopover} onOpenChange={setOpenAreaFilterPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openAreaFilterPopover}
                  className="w-[210px] justify-between"
                >
                  {selectedAreaFilter || "Lọc theo Khu"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[210px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Tìm kiếm khu..." />
                  <CommandList>
                    <CommandEmpty>Không tìm thấy khu.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="all"
                        onSelect={() => {
                          setSelectedAreaFilter("")
                          setOpenAreaFilterPopover(false)
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedAreaFilter === "" ? "opacity-100" : "opacity-0"
                          )}
                        />
                        Tất cả khu
                      </CommandItem>
                      {areaOptions.map((area) => (
                        <CommandItem
                          key={area}
                          value={area}
                          onSelect={() => {
                            setSelectedAreaFilter(area === selectedAreaFilter ? "" : area)
                            setOpenAreaFilterPopover(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedAreaFilter === area ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {area}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Select
              value={selectedTypeFilter || "all"}
              onValueChange={(value) => setSelectedTypeFilter(value === "all" ? "" : value)}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Lọc loại phòng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả loại phòng</SelectItem>
                <SelectItem value="Lý thuyết">Lý thuyết</SelectItem>
                <SelectItem value="Thực hành">Thực hành</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={selectedStatusFilter || "all"}
              onValueChange={(value) => setSelectedStatusFilter(value === "all" ? "" : value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Lọc trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                <SelectItem value="Có thể sử dụng">Có thể sử dụng</SelectItem>
                <SelectItem value="Không thể sử dụng">Không thể sử dụng</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto">
              <Badge variant="secondary" className="text-sm font-medium">
                Tổng phòng học: {visibleRoomCount}/{totalRoomCount}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Khu học</TableHead>
                <TableHead>Tên Phòng học</TableHead>
                <TableHead>Loại phòng</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRooms.map((room) => (
                <TableRow key={room.id ?? room.code ?? `${room.building}-${room.type}-${room.status}`}> 
                  <TableCell className="font-medium">{room.building}</TableCell>
                  <TableCell>{room.code}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Monitor className="h-3 w-3 text-muted-foreground" />
                      {room.type}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="default">
                      {room.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleOpenEditRoom(room)}
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
    </div>
  )
}
