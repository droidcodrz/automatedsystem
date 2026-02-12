'use client';

import { useEffect, useState } from 'react';
import { dashboardApi } from '@/lib/api';
import {
  Users,
  Calendar,
  CheckCircle,
  XCircle,
  Activity,
  Radio,
} from 'lucide-react';

interface Stats {
  totalProfiles: number;
  totalTasks: number;
  activeTasks: number;
  bookedTasks: number;
  failedTasks: number;
  activeSessions: number;
}

interface LogEntry {
  id: string;
  level: string;
  message: string;
  createdAt: string;
  task: { destCountry: string; visaCategory: string };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = async () => {
    try {
      const { data } = await dashboardApi.getStats();
      setStats(data.stats);
      setLogs(data.recentLogs);
    } catch {
      // silently fail on refresh
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const statCards = [
    { label: 'Total Profiles', value: stats?.totalProfiles || 0, icon: Users, color: 'text-blue-600 bg-blue-100' },
    { label: 'Total Tasks', value: stats?.totalTasks || 0, icon: Calendar, color: 'text-purple-600 bg-purple-100' },
    { label: 'Active Monitoring', value: stats?.activeTasks || 0, icon: Radio, color: 'text-orange-600 bg-orange-100' },
    { label: 'Booked', value: stats?.bookedTasks || 0, icon: CheckCircle, color: 'text-green-600 bg-green-100' },
    { label: 'Failed', value: stats?.failedTasks || 0, icon: XCircle, color: 'text-red-600 bg-red-100' },
    { label: 'Active Sessions', value: stats?.activeSessions || 0, icon: Activity, color: 'text-teal-600 bg-teal-100' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {statCards.map((card) => (
          <div key={card.label} className="card flex items-center gap-4">
            <div className={`p-3 rounded-lg ${card.color}`}>
              <card.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{card.value}</p>
              <p className="text-sm text-gray-500">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Live Logs</h2>
        <div className="space-y-2 max-h-96 overflow-auto">
          {logs.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">No recent activity</p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 text-sm py-2 border-b border-gray-100 last:border-0"
              >
                <span
                  className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                    log.level === 'error'
                      ? 'bg-red-500'
                      : log.level === 'warn'
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800">{log.message}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {log.task.destCountry} / {log.task.visaCategory} &mdash;{' '}
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
