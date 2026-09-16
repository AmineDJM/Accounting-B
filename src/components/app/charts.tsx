"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtEur } from "@/lib/utils";

const axis = { stroke: "var(--fg-subtle)", fontSize: 11 } as const;

export function PortfolioChart({ data }: { data: { date: string; value: number }[] }) {
  if (data.length < 2) return <div className="flex h-56 items-center justify-center text-sm text-fg-subtle">Pas encore assez d&apos;historique valorisé.</div>;
  return (
    <ResponsiveContainer width="100%" height={224}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)} k€` : `${v} €`)} />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => [fmtEur(Number(v)), "Valeur"]} labelFormatter={(l) => String(l)} />
        <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} fill="url(#pv)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function FlowsChart({ data }: { data: { month: string; deposits: number; withdrawals: number }[] }) {
  if (data.length === 0) return <div className="flex h-56 items-center justify-center text-sm text-fg-subtle">Aucun flux fiat importé.</div>;
  return (
    <ResponsiveContainer width="100%" height={224}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} tickFormatter={(m: string) => m.slice(2).replace("-", "/")} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)} k€` : `${v} €`)} />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v, name) => [fmtEur(Number(v)), name === "deposits" ? "Dépôts" : "Retraits"]} />
        <Bar dataKey="deposits" fill="var(--positive)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="withdrawals" fill="var(--negative)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
