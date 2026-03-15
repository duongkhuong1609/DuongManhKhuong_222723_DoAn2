"use client"

import { FormEvent, useMemo, useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

type PreferenceData = {
  timePreferences: Array<{
    maNVTG: string
    thuTrongTuan: string
    tietDay: string
    mucDoUuTien: string
  }>
  otherPreferences: Array<{
    maNVK: string
    tenNV: string
    giaTri: string
    trangThaiDuyet: string
  }>
}

const WEEKDAY_OPTIONS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"]
const SESSION_OPTIONS = ["Sáng", "Chiều"]

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const payload = await response.json()
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Không thể tải dữ liệu")
  }
  return payload.data as PreferenceData
}

const getApprovalStatusClassName = (status: string) => {
  if (status === "Đã duyệt") return "text-emerald-700"
  if (status === "Không duyệt") return "text-red-600"
  return "text-red-600"
}

const getApprovalStatusLabel = (status: string) => {
  if (status === "Đã duyệt") return "Đã duyệt"
  if (status === "Không duyệt") return "Không duyệt"
  return "Chưa duyệt"
}

export function UserPreferencesModule() {
  const { data, error, isLoading, mutate } = useSWR("/api/user/preferences", fetcher)
  const safeData = data || { timePreferences: [], otherPreferences: [] }

  const [thuTrongTuan, setThuTrongTuan] = useState("Thứ 2")
  const [tietDay, setTietDay] = useState("Sáng")

  const [tenNV, setTenNV] = useState("")
  const [giaTri, setGiaTri] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  const disabled = useMemo(() => submitting, [submitting])
  const maxTimePreferencesReached = safeData.timePreferences.length >= 2

  const updateTimePreference = async (item: PreferenceData["timePreferences"][number]) => {
    const nextDay = prompt("Chỉnh thứ trong tuần", item.thuTrongTuan)
    if (nextDay === null) return

    const nextSession = prompt("Chỉnh buổi dạy (Sáng/Chiều)", item.tietDay)
    if (nextSession === null) return

    setMessage("")
    try {
      const response = await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "time",
          id: Number(item.maNVTG),
          thuTrongTuan: nextDay,
          tietDay: nextSession,
        }),
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setMessage(payload.error || "Không thể cập nhật nguyện vọng thời gian")
        return
      }

      setMessage("Đã cập nhật nguyện vọng thời gian")
      await mutate()
    } catch {
      setMessage("Lỗi kết nối khi cập nhật nguyện vọng thời gian")
    }
  }

  const deleteTimePreference = async (item: PreferenceData["timePreferences"][number]) => {
    const shouldDelete = confirm("Bạn có chắc muốn xóa nguyện vọng thời gian này?")
    if (!shouldDelete) return

    setMessage("")
    try {
      const response = await fetch("/api/user/preferences", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "time", id: Number(item.maNVTG) }),
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setMessage(payload.error || "Không thể xóa nguyện vọng thời gian")
        return
      }

      setMessage("Đã xóa nguyện vọng thời gian")
      await mutate()
    } catch {
      setMessage("Lỗi kết nối khi xóa nguyện vọng thời gian")
    }
  }

  const updateOtherPreference = async (item: PreferenceData["otherPreferences"][number]) => {
    const nextName = prompt("Chỉnh nội dung nguyện vọng", item.tenNV)
    if (nextName === null) return

    const nextPriority = prompt("Chỉnh mức độ ưu tiên", item.giaTri)
    if (nextPriority === null) return

    setMessage("")
    try {
      const response = await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "other",
          id: Number(item.maNVK),
          tenNV: nextName,
          giaTri: nextPriority,
        }),
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setMessage(payload.error || "Không thể cập nhật nguyện vọng đặc biệt")
        return
      }

      setMessage("Đã cập nhật nguyện vọng đặc biệt")
      await mutate()
    } catch {
      setMessage("Lỗi kết nối khi cập nhật nguyện vọng đặc biệt")
    }
  }

  const deleteOtherPreference = async (item: PreferenceData["otherPreferences"][number]) => {
    const shouldDelete = confirm("Bạn có chắc muốn xóa nguyện vọng đặc biệt này?")
    if (!shouldDelete) return

    setMessage("")
    try {
      const response = await fetch("/api/user/preferences", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "other", id: Number(item.maNVK) }),
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setMessage(payload.error || "Không thể xóa nguyện vọng đặc biệt")
        return
      }

      setMessage("Đã xóa nguyện vọng đặc biệt")
      await mutate()
    } catch {
      setMessage("Lỗi kết nối khi xóa nguyện vọng đặc biệt")
    }
  }

  const submitTimePreference = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (disabled || maxTimePreferencesReached) return

    setMessage("")
    setSubmitting(true)

    try {
      const response = await fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "time",
          thuTrongTuan,
          tietDay,
        }),
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setMessage(payload.error || "Không thể thêm nguyện vọng thời gian")
        return
      }

      setThuTrongTuan("Thứ 2")
      setTietDay("Sáng")
      setMessage("Đã thêm nguyện vọng thời gian")
      await mutate()
    } catch {
      setMessage("Lỗi kết nối khi thêm nguyện vọng thời gian")
    } finally {
      setSubmitting(false)
    }
  }

  const submitOtherPreference = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (disabled) return

    setMessage("")
    setSubmitting(true)

    try {
      const response = await fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "other", tenNV, giaTri }),
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setMessage(payload.error || "Không thể thêm nguyện vọng khác")
        return
      }

      setTenNV("")
      setGiaTri("")
      setMessage("Đã thêm nguyện vọng khác")
      await mutate()
    } catch {
      setMessage("Lỗi kết nối khi thêm nguyện vọng khác")
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải nguyện vọng cá nhân...</p>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nguyện vọng giảng dạy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={submitTimePreference} className="space-y-4 rounded-lg border p-4">
            <h3 className="font-medium">Thêm nguyện vọng thời gian</h3>

            <div className="space-y-2">
              <Label>Thứ trong tuần</Label>
              <Select value={thuTrongTuan} onValueChange={setThuTrongTuan}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn thứ trong tuần" />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAY_OPTIONS.map((day) => (
                    <SelectItem key={day} value={day}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Buổi dạy</Label>
              <div className="flex gap-2">
                {SESSION_OPTIONS.map((session) => (
                  <Button
                    key={session}
                    type="button"
                    variant={tietDay === session ? "default" : "outline"}
                    onClick={() => setTietDay(session)}
                  >
                    {session}
                  </Button>
                ))}
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Mức độ ưu tiên do quản trị viên điều chỉnh sau khi tiếp nhận nguyện vọng.
            </p>

            {maxTimePreferencesReached ? (
              <p className="text-sm text-destructive">Đã đạt tối đa 2 nguyện vọng thời gian.</p>
            ) : null}

            <Button type="submit" disabled={disabled || maxTimePreferencesReached}>Thêm nguyện vọng thời gian</Button>
          </form>

          <form onSubmit={submitOtherPreference} className="space-y-4 rounded-lg border p-4">
            <h3 className="font-medium">Thêm nguyện vọng đặc biệt</h3>
            <div className="space-y-2">
              <Label htmlFor="tenNV">Nội dung</Label>
              <Input
                id="tenNV"
                value={tenNV}
                onChange={(event) => setTenNV(event.target.value)}
                placeholder="VD: Hạn chế dạy thứ 7"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="giaTri">Mức độ ưu tiên</Label>
              <Input
                id="giaTri"
                type="number"
                min={1}
                max={3}
                step={1}
                value={giaTri}
                onChange={(event) => setGiaTri(event.target.value)}
                placeholder="VD: mức 1 (cao), 2 (trung bình), 3(bình thường)"
                required
              />
            </div>
            <Button type="submit" disabled={disabled}>Thêm nguyện vọng đặc biệt</Button>
          </form>
        </div>

        {error ? <p className="text-sm text-destructive">Không thể tải danh sách nguyện vọng hiện có, bạn vẫn có thể thêm mới.</p> : null}
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border p-4">
            <h3 className="mb-3 font-medium">Danh sách nguyện vọng thời gian</h3>
            <ul className="space-y-2 text-sm">
              {safeData.timePreferences.length === 0 ? (
                <li className="text-muted-foreground">Chưa có dữ liệu</li>
              ) : (
                safeData.timePreferences.map((item) => (
                  <li key={item.maNVTG} className="rounded border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{item.thuTrongTuan}</Badge>
                      <Badge variant="outline">{item.tietDay}</Badge>
                    </div>
                    {item.mucDoUuTien ? (
                      <p className="mt-1 text-muted-foreground">Mức độ ưu tiên: {item.mucDoUuTien}</p>
                    ) : null}
                    <div className="mt-3 flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => updateTimePreference(item)}>
                        Sửa
                      </Button>
                      <Button type="button" variant="destructive" size="sm" onClick={() => deleteTimePreference(item)}>
                        Xóa
                      </Button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="mb-3 font-medium">Danh sách nguyện vọng đặc biệt</h3>
            <ul className="space-y-2 text-sm">
              {safeData.otherPreferences.length === 0 ? (
                <li className="text-muted-foreground">Chưa có dữ liệu</li>
              ) : (
                safeData.otherPreferences.map((item) => (
                  <li key={item.maNVK} className="rounded border p-3">
                    <p className="font-medium">{item.tenNV}</p>
                    <p className="text-muted-foreground">Mức độ ưu tiên: {item.giaTri}</p>
                    <p className={getApprovalStatusClassName(item.trangThaiDuyet)}>
                      Trạng thái: {getApprovalStatusLabel(item.trangThaiDuyet)}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => updateOtherPreference(item)}>
                        Sửa
                      </Button>
                      <Button type="button" variant="destructive" size="sm" onClick={() => deleteOtherPreference(item)}>
                        Xóa
                      </Button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
