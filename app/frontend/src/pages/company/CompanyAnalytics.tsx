import { PageHeader } from '@/components/PageHeader';
import {
  BarChart3,
  Eye,
  ClipboardList,
  Users,
  HardHat,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

const METRICS = [
  { label: 'Job Views', value: '1,247', change: '+12%', trend: 'up', icon: Eye },
  { label: 'Applications Received', value: '89', change: '+8%', trend: 'up', icon: ClipboardList },
  { label: 'Candidates Saved', value: '34', change: '+3%', trend: 'up', icon: Users },
  { label: 'Workforce Requests', value: '7', change: '0%', trend: 'neutral', icon: HardHat },
];

const MONTHLY_DATA = [
  { month: 'Jan', views: 420, apps: 28 },
  { month: 'Feb', views: 580, apps: 35 },
  { month: 'Mar', views: 710, apps: 42 },
  { month: 'Apr', views: 890, apps: 56 },
  { month: 'May', views: 1247, apps: 89 },
];

export default function CompanyAnalytics() {
  const maxViews = Math.max(...MONTHLY_DATA.map((d) => d.views));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="Company Analytics"
        description="Track your recruitment metrics, job performance, and candidate engagement."
        actions={
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
            <BarChart3 className="h-3.5 w-3.5" />
            Last 30 days
          </span>
        }
      />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map((m) => {
          const Icon = m.icon;
          const TrendIcon = m.trend === 'up' ? TrendingUp : m.trend === 'down' ? TrendingDown : Minus;
          const trendColor = m.trend === 'up' ? 'text-emerald-400' : m.trend === 'down' ? 'text-red-400' : 'text-zinc-500';

          return (
            <div
              key={m.label}
              className="border border-zinc-800/80 bg-[#0d0d0d] p-5 rounded-sm space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">{m.label}</p>
                <Icon className="h-4 w-4 text-zinc-600" />
              </div>
              <p className="text-2xl font-bold text-zinc-100">{m.value}</p>
              <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
                <TrendIcon className="h-3 w-3" />
                <span>{m.change} vs last month</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart Placeholder */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">Monthly Performance</h3>
          <div className="flex items-center gap-4 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
              Views
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              Applications
            </span>
          </div>
        </div>

        {/* Simple bar chart */}
        <div className="flex items-end gap-3 h-48 pt-4">
          {MONTHLY_DATA.map((d) => (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex items-end gap-1 justify-center" style={{ height: '160px' }}>
                <div
                  className="w-5 bg-[#f59e0b]/70 rounded-t-sm transition-all"
                  style={{ height: `${(d.views / maxViews) * 100}%` }}
                  title={`${d.views} views`}
                />
                <div
                  className="w-5 bg-blue-400/70 rounded-t-sm transition-all"
                  style={{ height: `${(d.apps / maxViews) * 100}%` }}
                  title={`${d.apps} applications`}
                />
              </div>
              <span className="text-[10px] text-zinc-500">{d.month}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Insights */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Top Performing Job</h4>
          <p className="text-sm text-zinc-200">Pipe Fitter — Abu Dhabi</p>
          <p className="text-[11px] text-zinc-500">342 views · 24 applications · 7.0% conversion</p>
        </div>
        <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Avg. Time to First Application</h4>
          <p className="text-2xl font-bold text-[#f59e0b]">2.4 days</p>
          <p className="text-[11px] text-zinc-500">Industry average: 4.1 days</p>
        </div>
      </div>
    </div>
  );
}