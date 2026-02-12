'use client';

import { useAuthStore } from '@/lib/store';
import { Settings, User, Key, Globe } from 'lucide-react';

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="space-y-6">
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <User className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold">Account</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Name</p>
              <p className="font-medium">{user?.name}</p>
            </div>
            <div>
              <p className="text-gray-500">Email</p>
              <p className="font-medium">{user?.email}</p>
            </div>
            <div>
              <p className="text-gray-500">Role</p>
              <p className="font-medium">{user?.role}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold">VFS Configuration</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 mb-1">Supported Routes</p>
              <p className="font-medium">Angola &rarr; Brazil</p>
              <p className="font-medium">Angola &rarr; Portugal</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 mb-1">Captcha Service</p>
              <p className="font-medium">
                Configured via server environment variables (CAPTCHA_SERVICE)
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Key className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold">Security</h2>
          </div>
          <div className="space-y-2 text-sm text-gray-600">
            <p>All sensitive data (passport numbers, proxy passwords) is encrypted at rest using AES-256-GCM.</p>
            <p>JWT-based authentication with configurable expiry.</p>
            <p>API rate limiting: 100 requests per minute per IP.</p>
            <p>Secrets are managed via environment variables &mdash; never hardcoded.</p>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Settings className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold">System Info</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Backend</p>
              <p className="font-medium">Node.js / Express / Prisma</p>
            </div>
            <div>
              <p className="text-gray-500">Frontend</p>
              <p className="font-medium">Next.js / Tailwind CSS</p>
            </div>
            <div>
              <p className="text-gray-500">Automation</p>
              <p className="font-medium">Playwright</p>
            </div>
            <div>
              <p className="text-gray-500">Database</p>
              <p className="font-medium">PostgreSQL</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
