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
  activeSection: string
  onSectionChange: (section: string) => void
}

export function AppSidebar({ activeSection, onSectionChange }: AppSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
          </div>
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
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Cài đặt">
              <Settings className="h-4 w-4" />
              <span>Cài đặt hệ thống</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
