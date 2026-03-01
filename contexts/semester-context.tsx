"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import useSWR from "swr"

interface Semester {
  _id: string
  code: string
  name: string
  shortName: string
  semesterNumber: 1 | 2 | 3
  academicYear: string
  startDate: string
  endDate: string
  isActive: boolean
  isCurrent: boolean
  status: "upcoming" | "ongoing" | "completed"
}

interface SemesterContextType {
  semesters: Semester[]
  currentSemester: Semester | null
  selectedSemester: Semester | null
  setSelectedSemester: (semester: Semester | null) => void
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

const SemesterContext = createContext<SemesterContextType | undefined>(undefined)

const fetcher = (url: string) => fetch(url).then((res) => res.json()).then((r) => r.data || [])

export function SemesterProvider({ children }: { children: ReactNode }) {
  const { data: semesters = [], error, isLoading, mutate } = useSWR<Semester[]>("/api/semesters", fetcher)
  const [selectedSemester, setSelectedSemester] = useState<Semester | null>(null)

  // Set current semester as default when data loads
  useEffect(() => {
    if (semesters.length > 0 && !selectedSemester) {
      const current = semesters.find((s) => s.isCurrent)
      if (current) {
        setSelectedSemester(current)
      } else {
        // If no current semester, use the first one
        setSelectedSemester(semesters[0])
      }
    }
  }, [semesters, selectedSemester])

  const currentSemester = semesters.find((s) => s.isCurrent) || null

  const refetch = useCallback(() => {
    mutate()
  }, [mutate])

  return (
    <SemesterContext.Provider
      value={{
        semesters,
        currentSemester,
        selectedSemester,
        setSelectedSemester,
        isLoading,
        error: error || null,
        refetch,
      }}
    >
      {children}
    </SemesterContext.Provider>
  )
}

export function useSemester() {
  const context = useContext(SemesterContext)
  if (context === undefined) {
    throw new Error("useSemester must be used within a SemesterProvider")
  }
  return context
}
