'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { notificationApi } from '@/lib/api';
import { Bell, Mail, MessageSquare, Send } from 'lucide-react';

interface Preference {
  id: string;
  type: string;
  enabled: boolean;
  config: string | null;
}

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [telegramChatId, setTelegramChatId] = useState('');

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const { data } = await notificationApi.getPreferences();
      setPrefs(data.preferences);
      const tgPref = data.preferences.find((p: Preference) => p.type === 'TELEGRAM');
      if (tgPref?.config) {
        try {
          setTelegramChatId(JSON.parse(tgPref.config).chatId || '');
        } catch { /* ignore */ }
      }
    } catch {
      toast.error('Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const toggleChannel = async (type: string, enabled: boolean, config?: string) => {
    try {
      await notificationApi.updatePreference({ type, enabled, config });
      toast.success(`${type} notifications ${enabled ? 'enabled' : 'disabled'}`);
      loadPreferences();
    } catch {
      toast.error('Failed to update preference');
    }
  };

  const saveTelegramConfig = async () => {
    try {
      await notificationApi.updatePreference({
        type: 'TELEGRAM',
        enabled: true,
        config: JSON.stringify({ chatId: telegramChatId }),
      });
      toast.success('Telegram configured');
      loadPreferences();
    } catch {
      toast.error('Failed to save Telegram config');
    }
  };

  const testNotification = async (type: string) => {
    try {
      const { data } = await notificationApi.test(type);
      if (data.success) {
        toast.success('Test notification sent');
      } else {
        toast.error('Test notification failed');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Test failed');
    }
  };

  const isEnabled = (type: string) => prefs.find((p) => p.type === type)?.enabled ?? false;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Notification Settings</h1>

      <div className="space-y-4">
        {/* Telegram */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">Telegram</h3>
                <p className="text-sm text-gray-500">Get instant alerts via Telegram bot</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={isEnabled('TELEGRAM')}
                onChange={(e) => toggleChannel('TELEGRAM', e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
          <div className="flex gap-2">
            <input
              className="input-field flex-1"
              placeholder="Telegram Chat ID"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
            />
            <button onClick={saveTelegramConfig} className="btn-primary">Save</button>
            <button
              onClick={() => testNotification('TELEGRAM')}
              className="btn-secondary flex items-center gap-1"
            >
              <Send className="w-4 h-4" />
              Test
            </button>
          </div>
        </div>

        {/* Email */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">Email</h3>
                <p className="text-sm text-gray-500">Receive notifications to your registered email</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => testNotification('EMAIL')}
                className="btn-secondary flex items-center gap-1 text-sm"
              >
                <Send className="w-4 h-4" />
                Test
              </button>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={isEnabled('EMAIL')}
                  onChange={(e) => toggleChannel('EMAIL', e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Notifications will be sent to your account email. Configure SMTP in server settings.
          </p>
        </div>

        {/* Desktop */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">Desktop Notifications</h3>
                <p className="text-sm text-gray-500">Browser push notifications (requires permission)</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={isEnabled('DESKTOP')}
                onChange={(e) => {
                  if (e.target.checked && 'Notification' in window) {
                    Notification.requestPermission().then((perm) => {
                      if (perm === 'granted') {
                        toggleChannel('DESKTOP', true);
                      } else {
                        toast.error('Notification permission denied');
                      }
                    });
                  } else {
                    toggleChannel('DESKTOP', false);
                  }
                }}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
