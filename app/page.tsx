"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { DashboardOverview } from "@/components/dashboard/overview"
import { InstructorsModule } from "@/components/dashboard/instructors"
import { InstructorPreferencesModule } from "@/components/dashboard/instructor-preferences"
import { RoomsModule } from "@/components/dashboard/rooms"
import { ClassesModule } from "@/components/dashboard/classes"
import { CoursesModule } from "@/components/dashboard/courses"
import { TimeslotsModule } from "@/components/dashboard/timeslots"
import { ScheduleGenerator } from "@/components/dashboard/schedule-generator"
import { TimetableView } from "@/components/dashboard/timetable"
import { StatisticsModule } from "@/components/dashboard/statistics"
import { ExportModule } from "@/components/dashboard/export"
import { SemestersModule } from "@/components/dashboard/semesters"
import { UserProfileModule } from "@/components/dashboard/user-profile"
import { UserPreferencesModule } from "@/components/dashboard/user-preferences"
import { UserOverviewModule } from "@/components/dashboard/user-overview"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { SemesterProvider } from "@/contexts/semester-context"
import { Button } from "@/components/ui/button"
import { AuthSession } from "@/lib/auth-session"

const sectionTitles: Record<string, string> = {
  dashboard: "Tổng quan",
  semesters: "Quản lý Học kỳ",
  instructors: "Quản lý Giảng viên",
  "instructor-preferences": "Quản lý nguyện vọng giảng viên",
  rooms: "Quản lý Phòng học",
  classes: "Quản lý Lớp học",
  courses: "Quản lý Môn học",
  timeslots: "Xem giờ dạy",
  "schedule-generator": "Lập lịch tự động",
  timetable: "Xem thời khóa biểu",
  statistics: "Thống kê giờ dạy",
  export: "Xuất lịch dạy",
  "user-profile": "Thông tin cá nhân",
  "user-timeslots": "Giờ dạy cá nhân",
  "user-timetable": "Lịch dạy cá nhân",
  "user-preferences": "Nguyện vọng giảng dạy",
}

const adminSections = [
  "dashboard",
  "semesters",
  "instructors",
  "instructor-preferences",
  "rooms",
  "classes",
  "courses",
  "timeslots",
  "schedule-generator",
  "timetable",
  "statistics",
  "export",
]

const userSections = ["dashboard", "user-profile", "user-timeslots", "user-timetable", "user-preferences"]

export default function DashboardPage() {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState("dashboard")
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)

  useEffect(() => {
    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" })
        const payload = await response.json()

        if (!response.ok || !payload.success) {
          router.replace("/login")
          return
        }

        setSession(payload.data)
      } catch {
        router.replace("/login")
      } finally {
        setLoadingSession(false)
      }
    }

    loadSession()
  }, [router])

  const allowedSections = useMemo(() => {
    if (!session) return []
    return session.role === "admin" ? adminSections : userSections
  }, [session])

  useEffect(() => {
    if (!session) return
    if (!allowedSections.includes(activeSection)) {
      setActiveSection(session.role === "admin" ? "dashboard" : "user-profile")
    }
  }, [activeSection, allowedSections, session])

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } finally {
      router.replace("/login")
      router.refresh()
    }
  }

  const renderContent = () => {
    if (!session) return null

    if (session.role === "user") {
      switch (activeSection) {
        case "dashboard":
          return <UserOverviewModule />
        case "user-profile":
          return <UserProfileModule />
        case "user-timeslots":
          return <TimeslotsModule />
        case "user-timetable":
          return <TimetableView userMode />
        case "user-preferences":
          return <UserPreferencesModule />
        default:
          return <UserProfileModule />
      }
    }

    switch (activeSection) {
      case "dashboard":
        return <DashboardOverview />
      case "semesters":
        return <SemestersModule />
      case "instructors":
        return <InstructorsModule />
      case "instructor-preferences":
        return <InstructorPreferencesModule />
      case "rooms":
        return <RoomsModule />
      case "classes":
        return <ClassesModule />
      case "courses":
        return <CoursesModule />
      case "timeslots":
        return <TimeslotsModule />
      case "schedule-generator":
        return <ScheduleGenerator />
      case "timetable":
        return <TimetableView />
      case "statistics":
        return <StatisticsModule />
      case "export":
        return <ExportModule />
      default:
        return <DashboardOverview />
    }
  }

  if (loadingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-sm text-muted-foreground">Đang kiểm tra đăng nhập...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">Đang chuyển đến trang đăng nhập...</p>
          <Button variant="outline" size="sm" onClick={() => router.replace("/login")}>
            Mở trang đăng nhập
          </Button>
        </div>
      </div>
    )
  }

  return (
    <SemesterProvider>
      <SidebarProvider>
        <AppSidebar
          role={session.role}
          accountName={session.tenTK}
          instructorName={session.tenGV}
          accountEmail={session.emailTK}
          department={session.khoa}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onLogout={handleLogout}
        />
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <span className="text-muted-foreground">Quản lý Lịch Dạy</span>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{sectionTitles[activeSection]}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{session.tenTK}</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Đăng xuất
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {renderContent()}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </SemesterProvider>
  )
}
