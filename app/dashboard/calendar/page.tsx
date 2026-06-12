"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { toast } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { cn } from "@/lib/utils/cn";
import type { CalendarEvent } from "@/types/jarvis";

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

export default function CalendarPage() {
  const ref = useGsapEntrance();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const from = startOfMonth(cursor).toISOString();
    const to = addMonths(cursor, 1).toISOString();
    const res = await fetch(`/api/events?from=${from}&to=${to}`);
    setEvents(await res.json());
  }, [cursor]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const grid = useMemo(() => {
    const first = startOfMonth(cursor);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = new Date(e.startsAt).toDateString();
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const dayEvents = (eventsByDay.get(selectedDay.toDateString()) ?? []).sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt)
  );

  const remove = async (id: string) => {
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div ref={ref} className="px-4 md:px-8 py-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {cursor.toLocaleString("default", { month: "long", year: "numeric" })}
          </h1>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month">
              <ChevronLeft size={15} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCursor(startOfMonth(new Date()))}>
              Today
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">
              <ChevronRight size={15} />
            </Button>
          </div>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus size={14} /> New event
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <Card className="p-3">
          <div className="grid grid-cols-7 mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-center text-[10px] uppercase tracking-wider text-text-muted py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((day, i) => {
              if (!day) return <div key={i} />;
              const evs = eventsByDay.get(day.toDateString()) ?? [];
              const isToday = sameDay(day, new Date());
              const isSelected = sameDay(day, selectedDay);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    "aspect-square rounded-md p-1 flex flex-col items-center justify-start text-xs transition-colors",
                    isSelected ? "bg-white/[0.08] ring-1 ring-emerald-400/30" : "hover:bg-white/[0.04]"
                  )}
                >
                  <span
                    className={cn(
                      "h-6 w-6 grid place-items-center rounded-full text-xs",
                      isToday ? "bg-emerald-400 text-black font-semibold" : "text-text-secondary"
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {evs.length > 0 && (
                    <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                      {evs.slice(0, 3).map((e) => (
                        <span key={e.id} className="h-1 w-1 rounded-full bg-emerald-400" />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-primary">
            {selectedDay.toLocaleDateString("default", { weekday: "long", month: "short", day: "numeric" })}
          </p>
          {dayEvents.length === 0 ? (
            <EmptyState title="No events" description="Nothing scheduled this day." />
          ) : (
            dayEvents.map((e) => (
              <Card key={e.id} className="group py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">{e.title}</p>
                    <p className="text-[11px] text-text-muted mt-0.5 flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(e.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
                      {new Date(e.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {e.location && (
                      <p className="text-[11px] text-text-muted mt-0.5 flex items-center gap-1">
                        <MapPin size={10} /> {e.location}
                      </p>
                    )}
                  </div>
                  <button onClick={() => remove(e.id)} className="text-text-muted hover:text-rose-400 opacity-0 group-hover:opacity-100" aria-label="Delete">
                    <Trash2 size={12} />
                  </button>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      <NewEventDialog open={open} onClose={() => setOpen(false)} day={selectedDay} onCreated={refresh} />
    </div>
  );
}

function NewEventDialog({
  open,
  onClose,
  day,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  day: Date;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    if (!open) return;
    const base = new Date(day);
    base.setHours(9, 0, 0, 0);
    const endBase = new Date(base);
    endBase.setHours(10, 0, 0, 0);
    const fmt = (d: Date) => {
      const off = d.getTimezoneOffset();
      return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
    };
    setStart(fmt(base));
    setEnd(fmt(endBase));
  }, [open, day]);

  const create = async () => {
    if (!title.trim() || !start || !end) return;
    await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        location,
        description,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
      }),
    });
    toast.success("Event created");
    setTitle("");
    setLocation("");
    setDescription("");
    onClose();
    onCreated();
  };

  return (
    <Dialog open={open} onClose={onClose} title="New event">
      <div className="space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" autoFocus />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] uppercase text-text-muted mb-1">Start</label>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="glass-input h-9 px-2 rounded-md text-xs w-full"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-text-muted mb-1">End</label>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="glass-input h-9 px-2 rounded-md text-xs w-full"
            />
          </div>
        </div>
        <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" />
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Notes (optional)" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={!title.trim()}>Create</Button>
        </div>
      </div>
    </Dialog>
  );
}
