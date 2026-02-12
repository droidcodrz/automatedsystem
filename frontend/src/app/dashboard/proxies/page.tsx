'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { proxyApi } from '@/lib/api';
import { Plus, Trash2, Shield, AlertTriangle } from 'lucide-react';

interface Proxy {
  id: string;
  url: string;
  username: string | null;
  password: string | null;
  country: string | null;
  isActive: boolean;
  failCount: number;
  lastUsed: string | null;
}

export default function ProxiesPage() {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    url: '',
    username: '',
    password: '',
    country: '',
  });

  useEffect(() => {
    loadProxies();
  }, []);

  const loadProxies = async () => {
    try {
      const { data } = await proxyApi.list();
      setProxies(data.proxies);
    } catch (err: any) {
      if (err.response?.status === 403) {
        toast.error('Admin access required');
      } else {
        toast.error('Failed to load proxies');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await proxyApi.create(form);
      toast.success('Proxy added');
      setShowForm(false);
      setForm({ url: '', username: '', password: '', country: '' });
      loadProxies();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add proxy');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this proxy?')) return;
    try {
      await proxyApi.delete(id);
      toast.success('Proxy removed');
      loadProxies();
    } catch {
      toast.error('Failed to remove proxy');
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
        <h1 className="text-2xl font-bold text-gray-900">Proxy Configuration</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Proxy
        </button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">Add Proxy</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Proxy URL</label>
              <input
                className="input-field"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                required
                placeholder="http://proxy-server:port"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username (optional)</label>
              <input
                className="input-field"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="proxy-user"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password (optional)</label>
              <input
                type="password"
                className="input-field"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="proxy-pass"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country (optional)</label>
              <input
                className="input-field"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                placeholder="e.g. Angola, Portugal"
              />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <button type="submit" className="btn-primary">Add Proxy</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {proxies.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Shield className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No proxies configured. The system will use direct connections.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {proxies.map((proxy) => (
              <div
                key={proxy.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      proxy.isActive ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <div>
                    <p className="font-medium text-sm">{proxy.url}</p>
                    <p className="text-xs text-gray-500">
                      {proxy.country || 'No country'} &middot;{' '}
                      {proxy.username || 'No auth'} &middot;{' '}
                      Fails: {proxy.failCount}
                      {proxy.lastUsed && ` · Last used: ${new Date(proxy.lastUsed).toLocaleString()}`}
                    </p>
                  </div>
                  {proxy.failCount > 0 && (
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  )}
                </div>
                <button
                  onClick={() => handleDelete(proxy.id)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
