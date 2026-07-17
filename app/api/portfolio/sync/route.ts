import { withUser } from "@/lib/auth/with-user";
import { syncPortfolio } from "@/lib/services/portfolio-sync";

export const dynamic = "force-dynamic";

export const POST = withUser(async () => {
  const result = await syncPortfolio();
  return Response.json(result);
});
