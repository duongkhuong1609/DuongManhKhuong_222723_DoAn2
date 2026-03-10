"use client"

import {
  LayoutDashboard,
  Users,
  DoorOpen,
  BookOpen,
  GraduationCap,
  Clock,
  CalendarDays,
  CalendarRange,
  BarChart3,
  Download,
  Settings,
  Sparkles,
  User,
  Heart,
  LogOut,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const mainNavItems = [
  {
    title: "Tổng quan",
    icon: LayoutDashboard,
    id: "dashboard",
  },
]

const managementItems = [
  {
    title: "Học kỳ",
    icon: CalendarRange,
    id: "semesters",
  },
  {
    title: "Giảng viên",
    icon: Users,
    id: "instructors",
  },
  {
    title: "Nguyện vọng GV",
    icon: Heart,
    id: "instructor-preferences",
  },
  {
    title: "Phòng học",
    icon: DoorOpen,
    id: "rooms",
  },
  {
    title: "Lớp học",
    icon: GraduationCap,
    id: "classes",
  },
  {
    title: "Môn học",
    icon: BookOpen,
    id: "courses",
  },
  {
    title: "Giờ dạy",
    icon: Clock,
    id: "timeslots",
  },
]

const scheduleItems = [
  {
    title: "Lập lịch tự động",
    icon: Sparkles,
    id: "schedule-generator",
  },
  {
    title: "Xem thời khóa biểu",
    icon: CalendarDays,
    id: "timetable",
  },
]

const reportItems = [
  {
    title: "Thống kê giờ dạy",
    icon: BarChart3,
    id: "statistics",
  },
  {
    title: "Xuất lịch dạy",
    icon: Download,
    id: "export",
  },
]

interface AppSidebarProps {
  role: "admin" | "user"
  accountName: string
  instructorName?: string
  accountEmail?: string
  department?: string
  activeSection: string
  onSectionChange: (section: string) => void
  onLogout: () => void
}

const userItems = [
  {
    title: "Thông tin cá nhân",
    icon: User,
    id: "user-profile",
  },
  {
    title: "Giờ dạy",
    icon: Clock,
    id: "user-timeslots",
  },
  {
    title: "Lịch dạy",
    icon: CalendarDays,
    id: "user-timetable",
  },
  {
    title: "Nguyện vọng",
    icon: Heart,
    id: "user-preferences",
  },
]

const getAvatarInitial = (name: string) => {
  const normalized = String(name || "").trim()
  if (!normalized) return "?"
  return normalized.charAt(0).toUpperCase()
}

export function AppSidebar({
  role,
  accountName,
  instructorName,
  accountEmail,
  department,
  activeSection,
  onSectionChange,
  onLogout,
}: AppSidebarProps) {
  const avatarInitial = getAvatarInitial(accountName)

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
                aria-label="Xem thông tin tài khoản"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
                    {avatarInitial}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="space-y-1">
                <p className="text-sm font-medium leading-none">{accountName || "Tài khoản"}</p>
                <p className="text-xs text-muted-foreground">Quyền: {role}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {role === "admin" ? (
                <div className="space-y-2 px-2 py-1 text-sm">
                  <p><span className="text-muted-foreground">Email:</span> {accountEmail || "-"}</p>
                </div>
              ) : (
                <div className="space-y-2 px-2 py-1 text-sm">
                  <p><span className="text-muted-foreground">Giảng viên:</span> {instructorName || "-"}</p>
                  <p><span className="text-muted-foreground">Email:</span> {accountEmail || "-"}</p>
                  <p><span className="text-muted-foreground">Khoa:</span> {department || "-"}</p>
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeSection === item.id}
                    onClick={() => onSectionChange(item.id)}
                    tooltip={item.title}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {role === "admin" ? (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Quản lý dữ liệu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {managementItems.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={activeSection === item.id}
                        onClick={() => onSectionChange(item.id)}
                        tooltip={item.title}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator />

            <SidebarGroup>
              <SidebarGroupLabel>Lịch giảng dạy</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {scheduleItems.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={activeSection === item.id}
                        onClick={() => onSectionChange(item.id)}
                        tooltip={item.title}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator />

            <SidebarGroup>
              <SidebarGroupLabel>Báo cáo</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {reportItems.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={activeSection === item.id}
                        onClick={() => onSectionChange(item.id)}
                        tooltip={item.title}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel>Giảng viên</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {userItems.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={activeSection === item.id}
                      onClick={() => onSectionChange(item.id)}
                      tooltip={item.title}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Cài đặt">
              <Settings className="h-4 w-4" />
              <span>Cài đặt hệ thống</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Đăng xuất" onClick={onLogout}>
              <LogOut className="h-4 w-4" />
              <span>Đăng xuất</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
