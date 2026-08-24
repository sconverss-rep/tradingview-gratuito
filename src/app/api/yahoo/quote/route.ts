import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbols = searchParams.get("symbols");

  if (!symbols) {
    return Response.json({ error: "symbols required" }, { status: 400 });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
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
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
