"use client"

import { useState } from "react"
import { Plus, Search, Edit, Trash2, Monitor, Users } from "lucide-react"
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

const initialRooms: any[] = []

export function RoomsModule() {
  const [rooms, setRooms] = useState(initialRooms)
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newRoom, setNewRoom] = useState({
    code: "",
    building: "",
    capacity: "",
    type: "",
    equipment: "",
    status: "available"
  })

  const filteredRooms = rooms.filter(
    (room) =>
      room.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.building.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.type.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAddRoom = () => {
    if (newRoom.code && newRoom.building) {
      setRooms([
        ...rooms,
        { ...newRoom, id: rooms.length + 1, capacity: parseInt(newRoom.capacity) || 0 }
      ])
      setNewRoom({ code: "", building: "", capacity: "", type: "", equipment: "", status: "available" })
      setIsAddOpen(false)
    }
  }

  const handleDeleteRoom = (id: number) => {
    setRooms(rooms.filter((r) => r.id !== id))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Quản lý Phòng học</h2>
          <p className="text-muted-foreground">
            Quản lý danh sách phòng học, phòng thực hành và hội trường
          </p>
        </div>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="code">Mã phòng</Label>
                  <Input
                    id="code"
                    placeholder="VD: A201"
                    value={newRoom.code}
                    onChange={(e) => setNewRoom({ ...newRoom, code: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="building">Tòa nhà</Label>
                  <Select
                    value={newRoom.building}
                    onValueChange={(value) => setNewRoom({ ...newRoom, building: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn tòa nhà" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Tòa A">Tòa A</SelectItem>
                      <SelectItem value="Tòa B">Tòa B</SelectItem>
                      <SelectItem value="Tòa C">Tòa C</SelectItem>
                      <SelectItem value="Tòa D">Tòa D</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="capacity">Sức chứa</Label>
                  <Input
                    id="capacity"
                    type="number"
                    placeholder="50"
                    value={newRoom.capacity}
                    onChange={(e) => setNewRoom({ ...newRoom, capacity: e.target.value })}
                  />
                </div>
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
                      <SelectItem value="Hội trường">Hội trường</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="equipment">Thiết bị</Label>
                <Input
                  id="equipment"
                  placeholder="Máy chiếu, Điều hòa, ..."
                  value={newRoom.equipment}
                  onChange={(e) => setNewRoom({ ...newRoom, equipment: e.target.value })}
                />
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
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm phòng học..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Tòa nhà" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="a">Tòa A</SelectItem>
                <SelectItem value="b">Tòa B</SelectItem>
                <SelectItem value="c">Tòa C</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="all">
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Loại phòng" />
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
                <TableHead>Khu học</TableHead>
                <TableHead>Tên Phòng học</TableHead>
                <TableHead>Loại phòng</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRooms.map((room) => (
                <TableRow key={room.id}>
                  <TableCell className="font-medium">{room.building}</TableCell>
                  <TableCell>{room.code}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Monitor className="h-3 w-3 text-muted-foreground" />
                      {room.type}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={room.status === "available" ? "default" : "secondary"}>
                      {room.status === "available" ? "Sẵn sàng" : "Bảo trì"}
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
                        onClick={() => handleDeleteRoom(room.id)}
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
