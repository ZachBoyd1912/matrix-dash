import { getLifetimeCost, getCostSince, getTopSessions } from "@/lib/ai/cost";

export const dynamic = "force-dynamic";

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function GET() {
  return Response.json({
    lifetime: getLifetimeCost(),
    month: getCostSince(startOfMonthIso()),
    today: getCostSince(startOfTodayIso()),
    topSessions: getTopSessions(10),
  });
}
