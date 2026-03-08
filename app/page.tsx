"use client"

import { useState } from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { DashboardOverview } from "@/components/dashboard/overview"
import { InstructorsModule } from "@/components/dashboard/instructors"
import { RoomsModule } from "@/components/dashboard/rooms"
import { ClassesModule } from "@/components/dashboard/classes"
import { CoursesModule } from "@/components/dashboard/courses"
import { TimeslotsModule } from "@/components/dashboard/timeslots"
import { ScheduleGenerator } from "@/components/dashboard/schedule-generator"
import { TimetableView } from "@/components/dashboard/timetable"
import { StatisticsModule } from "@/components/dashboard/statistics"
import { ExportModule } from "@/components/dashboard/export"
import { SemestersModule } from "@/components/dashboard/semesters"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { SemesterProvider } from "@/contexts/semester-context"

const sectionTitles: Record<string, string> = {
  dashboard: "Tổng quan",
  semesters: "Quản lý Học kỳ",
  instructors: "Quản lý Giảng viên",
  rooms: "Quản lý Phòng học",
  classes: "Quản lý Lớp học",
  courses: "Quản lý Môn học",
  timeslots: "Xem giờ dạy",
  "schedule-generator": "Lập lịch tự động",
  timetable: "Xem thời khóa biểu",
  statistics: "Thống kê giờ dạy",
  export: "Xuất lịch dạy",
}

export default function DashboardPage() {
  const [activeSection, setActiveSection] = useState("dashboard")

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return <DashboardOverview />
      case "semesters":
        return <SemestersModule />
      case "instructors":
        return <InstructorsModule />
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

  return (
    <SemesterProvider>
      <SidebarProvider>
        <AppSidebar activeSection={activeSection} onSectionChange={setActiveSection} />
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
          </header>
          <main className="flex-1 overflow-auto p-6">
            {renderContent()}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </SemesterProvider>
  )
}
