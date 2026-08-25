"use client";

import {
  Crosshair,
  Minus,
  Slash,
  Square,
  Ruler,
  Trash2,
  TrendingUp,
  GitBranch,
  Eraser,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

interface ToolDef {
  key: DrawingTool;
  icon: typeof Crosshair;
  label: string;
  hint?: string;
}

// Grouped like TradingView's toolbar: drawing tools, then measurement, then management
const DRAWING_TOOLS: ToolDef[] = [
  { key: "cursor", icon: Crosshair, label: "Cursor", hint: "Modo navegación" },
  {
    key: "trendline",
    icon: Slash,
    label: "Línea de tendencia",
    hint: "Click en dos puntos para trazar una línea recta",
  },
  {
    key: "hline",
    icon: Minus,
    label: "Línea horizontal",
    hint: "Click en el chart para marcar un precio",
  },
  {
    key: "rectangle",
    icon: Square,
    label: "Rectángulo",
    hint: "Click en dos puntos para marcar una zona clave",
  },
  {
    key: "fibonacci",
    icon: TrendingUp,
    label: "Retroceso Fibonacci",
    hint: "Click en dos puntos (alto y bajo) para dibujar niveles",
  },
  {
    key: "channel",
    icon: GitBranch,
    label: "Canal paralelo",
    hint: "Click en 3 puntos: 2 para la línea base + 1 para el ancho",
  },
];

const MEASURE_TOOLS: ToolDef[] = [
  {
    key: "measure",
    icon: Ruler,
    label: "Regla / Medir",
    hint: "Click en dos puntos para medir Δ precio, %, barras y volumen",
  },
];

const MANAGE_TOOLS: ToolDef[] = [
  {
    key: "eraser",
    icon: Eraser,
    label: "Borrar individual",
    hint: "Click sobre un dibujo para eliminar solo ese",
  },
];

function Divider() {
  return <div className="my-1 h-px w-6 bg-tv-border" />;
}

function ToolButton({ t, active, onClick }: { t: ToolDef; active: boolean; onClick: () => void }) {
  const Icon = t.icon;
  return (
    <Tooltip>
      <TooltipTrigger
        onClick={onClick}
        aria-label={t.label}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-tv-panel-hover",
          active ? "bg-tv-blue/15 text-tv-blue" : "text-tv-text-muted hover:text-tv-text",
        )}
      >
        <Icon className="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        <div className="font-medium">{t.label}</div>
        {t.hint && <div className="mt-0.5 text-[10px] text-tv-text-muted">{t.hint}</div>}
      </TooltipContent>
    </Tooltip>
  );
}

export function LeftSidebar() {
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const clearDrawings = useChartStore((s) => s.clearDrawings);
  const symbol = useChartStore((s) => s.symbol);

  return (
    <aside className="flex w-11 flex-col items-center gap-0.5 border-r border-tv-border bg-tv-panel py-1.5">
      {DRAWING_TOOLS.map((t) => (
        <ToolButton key={t.key} t={t} active={tool === t.key} onClick={() => setTool(t.key)} />
      ))}

      <Divider />

      {MEASURE_TOOLS.map((t) => (
        <ToolButton key={t.key} t={t} active={tool === t.key} onClick={() => setTool(t.key)} />
      ))}

      <Divider />

      {MANAGE_TOOLS.map((t) => (
        <ToolButton key={t.key} t={t} active={tool === t.key} onClick={() => setTool(t.key)} />
      ))}

      <Tooltip>
        <TooltipTrigger
          onClick={() => clearDrawings(symbol)}
          aria-label="Borrar todos los dibujos"
          className="flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-red"
        >
          <Trash2 className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          <div className="font-medium">Borrar todos los dibujos</div>
          <div className="mt-0.5 text-[10px] text-tv-text-muted">
            Limpia todos los dibujos de este símbolo
          </div>
        </TooltipContent>
      </Tooltip>
    </aside>
  );
}
