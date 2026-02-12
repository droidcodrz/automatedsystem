'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { logApi } from '@/lib/api';
import { Download, Filter } from 'lucide-react';

interface LogEntry {
  id: string;
  level: string;
  message: string;
  details: string | null;
  createdAt: string;
  taskId: string;
  task: { destCountry: string; visaCategory: string };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    level: '',
    from: '',
    to: '',
  });

  useEffect(() => {
    loadLogs();
  }, [pagination.page, filters]);

  const loadLogs = async () => {
    try {
      const params: Record<string, string> = { page: String(pagination.page), limit: '50' };
      if (filters.level) params.level = filters.level;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;

      const { data } = await logApi.list(params);
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch {
      toast.error('Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'csv' | 'txt') => {
    try {
      const params: Record<string, string> = { format };
      const { data } = await logApi.export(params);
      const blob = new Blob([data], { type: format === 'csv' ? 'text/csv' : 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Logs exported as ${format.toUpperCase()}`);
    } catch {
      toast.error('Export failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Logs & History</h1>
        <div className="flex gap-2">
          <button onClick={() => handleExport('csv')} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button onClick={() => handleExport('txt')} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" />
            TXT
          </button>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex items-center gap-4">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            className="input-field w-auto"
            value={filters.level}
            onChange={(e) => setFilters({ ...filters, level: e.target.value })}
          >
            <option value="">All Levels</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
          <input
            type="date"
            className="input-field w-auto"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            placeholder="From"
          />
          <input
            type="date"
            className="input-field w-auto"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            placeholder="To"
          />
          <button
            onClick={() => setFilters({ level: '', from: '', to: '' })}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="card">
        <div className="space-y-2 max-h-[600px] overflow-auto">
          {logs.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No logs found</p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 text-sm py-2 px-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 rounded"
              >
                <span
                  className={`mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                    log.level === 'error'
                      ? 'bg-red-100 text-red-700'
                      : log.level === 'warn'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {log.level.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800">{log.message}</p>
                  {log.details && (
                    <pre className="text-xs text-gray-500 mt-1 bg-gray-50 p-2 rounded overflow-auto">
                      {log.details}
                    </pre>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-500">
                    {log.task.destCountry} / {log.task.visaCategory}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                disabled={pagination.page <= 1}
                className="btn-secondary text-sm"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                disabled={pagination.page >= pagination.pages}
                className="btn-secondary text-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
