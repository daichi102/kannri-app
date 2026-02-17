'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import type { Project } from '@/lib/types/project'
import type { Department } from '@/lib/types/project'

type ProjectWithNames = Project & {
  customer?: { name: string } | null
}

type CalendarEvent = {
  id: string
  title: string
  start: Date
  end: Date
  resource: ProjectWithNames
}

const locales = { ja }
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

const DEPARTMENT_LABEL: Record<Department, string> = {
  delivery: '配送',
  construction: '工事',
  repair: '修理',
}

// 部門ごとの色（工事: オレンジ, 配送: 青, 修理: 緑）
const DEPARTMENT_COLORS: Record<Department, { backgroundColor: string; borderColor: string }> = {
  construction: { backgroundColor: '#ea580c', borderColor: '#c2410c' },
  delivery: { backgroundColor: '#0ea5e9', borderColor: '#0284c7' },
  repair: { backgroundColor: '#22c55e', borderColor: '#16a34a' },
}

function projectsToEvents(projects: ProjectWithNames[]): CalendarEvent[] {
  const events: CalendarEvent[] = []

  for (const p of projects) {
    const startStr = p.start_date ?? p.due_date
    if (!startStr) continue

    const customerName = p.customer?.name ?? ''
    const dept = DEPARTMENT_LABEL[p.department]
    const title = `${p.project_number} ${dept} ${customerName}`.trim()

    const startDate = new Date(startStr + 'T00:00:00')
    const endStr = p.due_date ?? p.start_date ?? startStr
    const endDate = new Date(endStr + 'T23:59:59')

    if (endDate < startDate) {
      events.push({
        id: p.id,
        title,
        start: startDate,
        end: new Date(startStr + 'T23:59:59'),
        resource: p,
      })
    } else {
      events.push({
        id: p.id,
        title,
        start: startDate,
        end: endDate,
        resource: p,
      })
    }
  }

  return events
}

export default function ProjectCalendar() {
  const [projects, setProjects] = useState<ProjectWithNames[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<ProjectWithNames | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('projects')
        .select('*, customer:customers(name)')
        .order('start_date', { ascending: true, nullsFirst: false })

      setProjects((data ?? []) as ProjectWithNames[])
      setLoading(false)
    }
    load()
  }, [])

  const events = projectsToEvents(projects)

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedDate(null)
    setSelectedProject(event.resource)
  }

  const handleSelectSlot = ({ start }: { start: Date }) => {
    setSelectedProject(null)
    setSelectedDate(start)
  }

  const handleShowMore = (events: object[], date: Date) => {
    setSelectedProject(null)
    setSelectedDate(date)
  }

  // 選択した日の案件（start_date または due_date がその日を含む）
  const dayProjects = useMemo(() => {
    if (!selectedDate) return []
    const dayStr = format(selectedDate, 'yyyy-MM-dd')
    return events
      .filter((e) => {
        const startStr = format(e.start, 'yyyy-MM-dd')
        const endStr = format(e.end, 'yyyy-MM-dd')
        return dayStr >= startStr && dayStr <= endStr
      })
      .map((e) => e.resource)
      .sort((a, b) => a.project_number.localeCompare(b.project_number))
  }, [selectedDate, events])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setSelectedProject(null)
      }
    }
    if (selectedProject) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selectedProject])

  const formats = {
    dayFormat: 'd日(E)',
    weekdayFormat: 'EEE',
    monthHeaderFormat: 'yyyy年M月',
    dayHeaderFormat: 'M/d(E)',
    timeGutterFormat: 'HH:mm',
    eventTimeRangeFormat: ({ start }: { start: Date }) => format(start, 'M/d', { locale: ja }),
  }

  if (loading) {
    return (
      <div className="h-[400px] flex items-center justify-center bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl">
        <p className="text-[var(--muted)] font-semibold">カレンダーを読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="flex gap-4 min-h-[500px]">
      {/* カレンダー（左側） */}
      <div className="flex-1 min-w-0 h-[500px] bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl overflow-hidden p-4 shadow-[var(--shadow)]">
      {selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" aria-modal="true">
          <div
            ref={modalRef}
            className="bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl p-6 shadow-xl max-w-sm w-full"
          >
            <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">
              {selectedProject.project_number} {DEPARTMENT_LABEL[selectedProject.department]}
            </h3>
            <p className="text-sm text-[var(--muted)] mb-4">{selectedProject.customer?.name ?? ''}</p>
            <p className="text-sm font-semibold text-[var(--foreground)] mb-3">入力を選択</p>
            <div className="space-y-2">
              <Link
                href={`/projects/${selectedProject.id}/costs`}
                className="block w-full py-3 px-4 text-center font-bold bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-hover)] transition-colors"
              >
                原価を入力
              </Link>
              <Link
                href={`/projects/${selectedProject.id}/expenses`}
                className="block w-full py-3 px-4 text-center font-bold bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-hover)] transition-colors"
              >
                経費を入力
              </Link>
              <Link
                href={`/projects/${selectedProject.id}/labor`}
                className="block w-full py-3 px-4 text-center font-bold bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-hover)] transition-colors"
              >
                人件費を入力
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setSelectedProject(null)}
              className="w-full mt-4 py-2 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        titleAccessor="title"
        onSelectEvent={handleSelectEvent}
        onSelectSlot={handleSelectSlot}
        onShowMore={handleShowMore}
        selectable
        eventPropGetter={(event) => {
          const dept = (event.resource as ProjectWithNames).department
          const colors = DEPARTMENT_COLORS[dept] ?? DEPARTMENT_COLORS.construction
          return {
            style: {
              backgroundColor: colors.backgroundColor,
              borderColor: colors.borderColor,
              borderLeftWidth: 4,
            },
          }
        }}
        views={['month']}
        defaultView="month"
        formats={formats}
        culture="ja"
        messages={{
          today: '今日',
          previous: '前',
          next: '次',
          month: '月',
          week: '週',
          day: '日',
          agenda: 'アジェンダ',
          date: '日付',
          time: '時間',
          event: '案件',
          noEventsInRange: 'この期間に案件はありません',
          showMore: (total) => `他 ${total} 件`,
        }}
        style={{ height: '100%' }}
      />
      </div>

      {/* 右側パネル: その日の案件 */}
      <aside
        className={`shrink-0 w-full md:w-80 lg:w-96 bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl shadow-[var(--shadow)] overflow-hidden transition-all ${
          selectedDate ? 'block' : 'hidden md:block'
        }`}
      >
        {selectedDate ? (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-4 border-b-2 border-[var(--card-border)] bg-[var(--primary-light)]">
              <h3 className="text-lg font-bold text-[var(--foreground)]">
                {format(selectedDate, 'M月d日(E)', { locale: ja })} の案件
              </h3>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="p-2 rounded-lg hover:bg-white/50 text-[var(--muted)] hover:text-[var(--foreground)]"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {dayProjects.length === 0 ? (
                <p className="text-sm text-[var(--muted)] py-4">この日の案件はありません</p>
              ) : (
                <div className="space-y-2">
                  {dayProjects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedProject(p)}
                      className="w-full flex items-center gap-3 p-3 text-left rounded-xl border-2 border-[var(--card-border)] hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/30 transition-colors"
                    >
                      <span
                        className="shrink-0 w-3 h-3 rounded-full"
                        style={{ backgroundColor: DEPARTMENT_COLORS[p.department].backgroundColor }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[var(--foreground)] truncate">
                          {p.project_number} {DEPARTMENT_LABEL[p.department]}
                        </p>
                        <p className="text-sm text-[var(--muted)] truncate">{p.customer?.name ?? '—'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center p-6">
            <p className="text-sm text-[var(--muted)] text-center">
              日付または「他 N 件」をタップすると<br />その日の案件がここに表示されます
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}
