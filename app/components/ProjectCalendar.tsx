'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectWithNames[]>([])
  const [loading, setLoading] = useState(true)

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
    router.push(`/projects/${event.resource.id}/estimates`)
  }

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
    <div className="h-[500px] bg-[var(--card)] border-2 border-[var(--card-border)] rounded-2xl overflow-hidden p-4 shadow-[var(--shadow)]">
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        titleAccessor="title"
        onSelectEvent={handleSelectEvent}
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
  )
}
