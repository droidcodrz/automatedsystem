'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { profileApi } from '@/lib/api';
import { Plus, Edit2, Trash2, Upload, Star } from 'lucide-react';

interface Profile {
  id: string;
  fullName: string;
  passportNumber: string;
  dateOfBirth: string;
  passportExpiry: string;
  nationality: string;
  email: string;
  phone: string;
  priority: string;
}

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    passportNumber: '',
    dateOfBirth: '',
    passportExpiry: '',
    nationality: 'Angolan',
    email: '',
    phone: '',
    priority: 'NORMAL' as 'HIGH' | 'NORMAL',
  });

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      const { data } = await profileApi.list();
      setProfiles(data.profiles);
    } catch {
      toast.error('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await profileApi.update(editingId, form);
        toast.success('Profile updated');
      } else {
        await profileApi.create(form);
        toast.success('Profile created');
      }
      resetForm();
      loadProfiles();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save profile');
    }
  };

  const handleEdit = (profile: Profile) => {
    setEditingId(profile.id);
    setForm({
      fullName: profile.fullName,
      passportNumber: profile.passportNumber,
      dateOfBirth: new Date(profile.dateOfBirth).toISOString().split('T')[0],
      passportExpiry: new Date(profile.passportExpiry).toISOString().split('T')[0],
      nationality: profile.nationality,
      email: profile.email,
      phone: profile.phone,
      priority: profile.priority as 'HIGH' | 'NORMAL',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this profile?')) return;
    try {
      await profileApi.delete(id);
      toast.success('Profile deleted');
      loadProfiles();
    } catch {
      toast.error('Failed to delete profile');
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { data } = await profileApi.bulkUpload(file);
      toast.success(`Uploaded ${data.created} profiles`);
      if (data.errors?.length) {
        toast.error(`${data.errors.length} rows had errors`);
      }
      loadProfiles();
    } catch {
      toast.error('Bulk upload failed');
    }
    e.target.value = '';
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({
      fullName: '',
      passportNumber: '',
      dateOfBirth: '',
      passportExpiry: '',
      nationality: 'Angolan',
      email: '',
      phone: '',
      priority: 'NORMAL',
    });
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
        <h1 className="text-2xl font-bold text-gray-900">Applicant Profiles</h1>
        <div className="flex gap-2">
          <label className="btn-secondary flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            Bulk Upload
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleBulkUpload} className="hidden" />
          </label>
          <button
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Profile
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit Profile' : 'New Profile'}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                className="input-field"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passport Number</label>
              <input
                className="input-field"
                value={form.passportNumber}
                onChange={(e) => setForm({ ...form, passportNumber: e.target.value })}
                required
                placeholder="N12345678"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
              <input
                type="date"
                className="input-field"
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passport Expiry</label>
              <input
                type="date"
                className="input-field"
                value={form.passportExpiry}
                onChange={(e) => setForm({ ...form, passportExpiry: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nationality</label>
              <input
                className="input-field"
                value={form.nationality}
                onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                className="input-field"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                placeholder="john@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                className="input-field"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
                placeholder="+244 XXX XXX XXX"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                className="input-field"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as 'HIGH' | 'NORMAL' })}
              >
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High Priority</option>
              </select>
            </div>
            <div className="md:col-span-2 flex gap-2">
              <button type="submit" className="btn-primary">
                {editingId ? 'Update Profile' : 'Create Profile'}
              </button>
              <button type="button" onClick={resetForm} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {profiles.length === 0 ? (
          <div className="col-span-full card text-center py-12 text-gray-500">
            No profiles yet. Add your first applicant profile.
          </div>
        ) : (
          profiles.map((profile) => (
            <div key={profile.id} className="card">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 flex items-center gap-1">
                    {profile.fullName}
                    {profile.priority === 'HIGH' && (
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                    )}
                  </h3>
                  <p className="text-sm text-gray-500">{profile.nationality}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(profile)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(profile.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <p><span className="text-gray-500">Passport:</span> {profile.passportNumber}</p>
                <p><span className="text-gray-500">DOB:</span> {new Date(profile.dateOfBirth).toLocaleDateString()}</p>
                <p><span className="text-gray-500">Expiry:</span> {new Date(profile.passportExpiry).toLocaleDateString()}</p>
                <p><span className="text-gray-500">Email:</span> {profile.email}</p>
                <p><span className="text-gray-500">Phone:</span> {profile.phone}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
