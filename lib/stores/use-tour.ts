import { create } from "zustand";

/**
 * Interactive onboarding tour. Chapters group steps; each step spotlights a
 * `data-tour="<key>"` element (or centers when no target). Owner-only chapters
 * are filtered out for members. Progress isn't persisted mid-tour (it's short);
 * completion is recorded server-side so it auto-launches only once.
 */

export interface TourStep {
  target?: string; // data-tour key to spotlight; omit for a centered card
  title: string;
  body: string;
  /** Navigate here before showing the step (so the target exists). */
  route?: string;
}

export interface TourChapter {
  id: string;
  title: string;
  ownerOnly?: boolean;
  steps: TourStep[];
}

export const TOUR_CHAPTERS: TourChapter[] = [
  {
    id: "welcome",
    title: "Welcome",
    steps: [
      {
        title: "Welcome to Matrix Dashboard",
        body: "A local-first command center for your work, your data, and your AI agents. Let's take two minutes to set you up.",
      },
      {
        title: "Local-first — what runs where",
        body: "The dashboard (this site) hosts your UI, data, and schedules. But your AGENTS run on YOUR OWN device via the Matrix Runner — so they use your files, your credentials, and your usage limits. Nothing agentic touches anyone else's machine.",
      },
    ],
  },
  {
    id: "chat",
    title: "Chat & providers",
    steps: [
      {
        route: "/dashboard/chat",
        target: "nav-chat",
        title: "Chat",
        body: "Talk to any model here. Add your own API keys — or your Claude subscription — in Settings → AI Providers; each account uses its own.",
      },
    ],
  },
  {
    id: "work",
    title: "Notes, tasks & projects",
    steps: [
      {
        target: "nav-notes",
        title: "Your workspace",
        body: "Notes, tasks, projects, memories, calendar, and email — all private to your account, synced where you want them.",
      },
    ],
  },
  {
    id: "runner",
    title: "Install Matrix Runner",
    steps: [
      {
        route: "/dashboard/settings/devices",
        target: "devices-pair",
        title: "Connect your device",
        body: "This is the key step. Generate a pair code and run the one-line installer on your machine — your agents will run there, on your own files, with your own credentials.",
      },
    ],
  },
  {
    id: "agents",
    title: "Agents & approvals",
    steps: [
      {
        route: "/dashboard/agents",
        target: "nav-agents",
        title: "Autonomous agents",
        body: "Create agents that run on your device. Anything risky pauses for YOUR approval — on-screen or on your phone — before it touches your machine.",
      },
    ],
  },
  {
    id: "accounts",
    title: "Invite your team",
    ownerOnly: true,
    steps: [
      {
        route: "/dashboard/settings/accounts",
        target: "nav-accounts",
        title: "Accounts",
        body: "As the owner, invite others with a one-time link. They set their own password, install their own runner, and get a fully isolated workspace.",
      },
    ],
  },
];

interface TourState {
  active: boolean;
  chapters: TourChapter[];
  chapterIndex: number;
  stepIndex: number;
  start: (opts: { isOwner: boolean }) => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
  current: () => { chapter: TourChapter; step: TourStep } | null;
  isLast: () => boolean;
}

export const useTour = create<TourState>((set, get) => ({
  active: false,
  chapters: [],
  chapterIndex: 0,
  stepIndex: 0,
  start: ({ isOwner }) => {
    const chapters = TOUR_CHAPTERS.filter((c) => isOwner || !c.ownerOnly);
    set({ active: true, chapters, chapterIndex: 0, stepIndex: 0 });
  },
  next: () => {
    const { chapters, chapterIndex, stepIndex } = get();
    const chapter = chapters[chapterIndex];
    if (!chapter) return;
    if (stepIndex + 1 < chapter.steps.length) {
      set({ stepIndex: stepIndex + 1 });
    } else if (chapterIndex + 1 < chapters.length) {
      set({ chapterIndex: chapterIndex + 1, stepIndex: 0 });
    } else {
      set({ active: false });
    }
  },
  prev: () => {
    const { chapters, chapterIndex, stepIndex } = get();
    if (stepIndex > 0) set({ stepIndex: stepIndex - 1 });
    else if (chapterIndex > 0) {
      const prevChapter = chapters[chapterIndex - 1];
      set({ chapterIndex: chapterIndex - 1, stepIndex: prevChapter.steps.length - 1 });
    }
  },
  stop: () => set({ active: false }),
  current: () => {
    const { active, chapters, chapterIndex, stepIndex } = get();
    if (!active) return null;
    const chapter = chapters[chapterIndex];
    const step = chapter?.steps[stepIndex];
    return chapter && step ? { chapter, step } : null;
  },
  isLast: () => {
    const { chapters, chapterIndex, stepIndex } = get();
    return (
      chapterIndex === chapters.length - 1 &&
      stepIndex === (chapters[chapterIndex]?.steps.length ?? 1) - 1
    );
  },
}));
