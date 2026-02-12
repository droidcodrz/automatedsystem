'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { bookingApi, profileApi } from '@/lib/api';
import { Play, Square, Trash2, Plus, Eye } from 'lucide-react';

interface Profile {
  id: string;
  fullName: string;
  priority: string;
}

interface BookingTask {
  id: string;
  destCountry: string;
  visaCategory: string;
  status: string;
  mode: string;
  refreshInterval: number;
  createdAt: string;
  updatedAt: string;
  profile?: { fullName: string };
}

const STATUS_BADGES: Record<string, string> = {
  PENDING: 'badge-info',
  MONITORING: 'badge-warning',
  SLOT_FOUND: 'badge-success',
  BOOKING: 'badge-warning',
  BOOKED: 'badge-success',
  FAILED: 'badge-danger',
  CANCELLED: 'badge-danger',
};

const VISA_CATEGORIES = {
  Brazil: ['Tourist', 'Business', 'Work', 'Student', 'Transit'],
  Portugal: ['Schengen Tourist', 'Schengen Business', 'National Visa D', 'Work Permit', 'Student'],
};

export default function AppointmentsPage() {
  const [tasks, setTasks] = useState<BookingTask[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [form, setForm] = useState({
    profileId: '',
    destCountry: 'Brazil' as 'Brazil' | 'Portugal',
    visaCategory: '',
    visaSubCategory: '',
    visaCenter: 'Luanda',
    vfsEmail: '',
    vfsPassword: '',
    mode: 'auto',
    refreshInterval: 10,
    preferredDateFrom: '',
    preferredDateTo: '',
    maxRetries: 5,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [tasksRes, profilesRes] = await Promise.all([
        bookingApi.list(),
        profileApi.list(),
      ]);
      setTasks(tasksRes.data.tasks);
      setProfiles(profilesRes.data.profiles);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await bookingApi.create(form);
      toast.success('Booking task created');
      setShowForm(false);
      setForm({ profileId: '', destCountry: 'Brazil', visaCategory: '', visaSubCategory: '', visaCenter: 'Luanda', vfsEmail: '', vfsPassword: '', mode: 'auto', refreshInterval: 10, preferredDateFrom: '', preferredDateTo: '', maxRetries: 5 });
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create task');
    }
  };

  const handleStart = async (id: string) => {
    try {
      await bookingApi.start(id);
      toast.success('Monitoring started');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to start');
    }
  };

  const handleStop = async (id: string) => {
    try {
      await bookingApi.stop(id);
      toast.success('Task stopped');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to stop');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      await bookingApi.delete(id);
      toast.success('Task deleted');
      loadData();
    } catch {
      toast.error('Failed to delete');
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
        <h1 className="text-2xl font-bold text-gray-900">Appointment Setup</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Booking Task
        </button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">Create Booking Task</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Applicant Profile</label>
              <select
                className="input-field"
                value={form.profileId}
                onChange={(e) => setForm({ ...form, profileId: e.target.value })}
                required
              >
                <option value="">Select profile...</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} {p.priority === 'HIGH' ? '(High Priority)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Origin Country</label>
              <input className="input-field bg-gray-50" value="Angola" disabled />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Destination Country</label>
              <select
                className="input-field"
                value={form.destCountry}
                onChange={(e) => setForm({ ...form, destCountry: e.target.value as 'Brazil' | 'Portugal', visaCategory: '' })}
              >
                <option value="Brazil">Brazil</option>
                <option value="Portugal">Portugal</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Visa Category</label>
              <select
                className="input-field"
                value={form.visaCategory}
                onChange={(e) => setForm({ ...form, visaCategory: e.target.value })}
                required
              >
                <option value="">Select category...</option>
                {VISA_CATEGORIES[form.destCountry].map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Visa Sub-Category (optional)</label>
              <input
                className="input-field"
                value={form.visaSubCategory}
                onChange={(e) => setForm({ ...form, visaSubCategory: e.target.value })}
                placeholder="e.g. Short Stay"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Visa Center</label>
              <input
                className="input-field"
                value={form.visaCenter}
                onChange={(e) => setForm({ ...form, visaCenter: e.target.value })}
                placeholder="e.g. Luanda"
              />
            </div>

            <div className="md:col-span-2 mt-2 p-4 bg-blue-50 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-800 mb-3">VFS Global Login Credentials</h3>
              <p className="text-xs text-blue-600 mb-3">Required to log into visa.vfsglobal.com and monitor appointments. Stored encrypted.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">VFS Email</label>
                  <input
                    type="email"
                    className="input-field"
                    value={form.vfsEmail}
                    onChange={(e) => setForm({ ...form, vfsEmail: e.target.value })}
                    required
                    placeholder="your-vfs-account@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">VFS Password</label>
                  <input
                    type="password"
                    className="input-field"
                    value={form.vfsPassword}
                    onChange={(e) => setForm({ ...form, vfsPassword: e.target.value })}
                    required
                    placeholder="Your VFS account password"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
              <select
                className="input-field"
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value })}
              >
                <option value="auto">Auto (book immediately)</option>
                <option value="manual">Manual (notify only)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Refresh Interval ({form.refreshInterval}s)
              </label>
              <input
                type="range"
                min={5}
                max={60}
                className="w-full"
                value={form.refreshInterval}
                onChange={(e) => setForm({ ...form, refreshInterval: parseInt(e.target.value) })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Date From</label>
              <input
                type="date"
                className="input-field"
                value={form.preferredDateFrom}
                onChange={(e) => setForm({ ...form, preferredDateFrom: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Date To</label>
              <input
                type="date"
                className="input-field"
                value={form.preferredDateTo}
                onChange={(e) => setForm({ ...form, preferredDateTo: e.target.value })}
              />
            </div>

            <div className="md:col-span-2 flex gap-2">
              <button type="submit" className="btn-primary">Create Task</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-500">Profile</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Destination</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Visa Type</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Mode</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    No booking tasks yet. Create one to get started.
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">{task.profile?.fullName || '-'}</td>
                    <td className="py-3 px-4">{task.destCountry}</td>
                    <td className="py-3 px-4">{task.visaCategory}</td>
                    <td className="py-3 px-4 capitalize">{task.mode}</td>
                    <td className="py-3 px-4">
                      <span className={STATUS_BADGES[task.status] || 'badge-info'}>
                        {task.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {['PENDING', 'CANCELLED', 'FAILED'].includes(task.status) && (
                          <button
                            onClick={() => handleStart(task.id)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                            title="Start Monitoring"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {['MONITORING', 'BOOKING', 'SLOT_FOUND'].includes(task.status) && (
                          <button
                            onClick={() => handleStop(task.id)}
                            className="p-1.5 text-orange-600 hover:bg-orange-50 rounded"
                            title="Stop"
                          >
                            <Square className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedTask(selectedTask === task.id ? null : task.id)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
