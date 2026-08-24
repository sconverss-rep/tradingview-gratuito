import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval") || "1d";
  const range = searchParams.get("range") || "1y";

  if (!symbol) {
    return Response.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return Response.json(
        { error: `Yahoo returned ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    return Response.json(data);
  } catch (e) {
    return Response.json(
      { error: String(e) },
      { status: 500 },
    );
  }
}
