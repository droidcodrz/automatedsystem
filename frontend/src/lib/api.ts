import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (email: string, password: string, name: string) =>
    api.post('/auth/register', { email, password, name }),
  getMe: () => api.get('/auth/me'),
};

// Profiles
export const profileApi = {
  list: () => api.get('/profiles'),
  get: (id: string) => api.get(`/profiles/${id}`),
  create: (data: Record<string, unknown>) => api.post('/profiles', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/profiles/${id}`, data),
  delete: (id: string) => api.delete(`/profiles/${id}`),
  bulkUpload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/profiles/bulk-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Bookings
export const bookingApi = {
  list: () => api.get('/bookings'),
  get: (id: string) => api.get(`/bookings/${id}`),
  create: (data: Record<string, unknown>) => api.post('/bookings', data),
  start: (id: string) => api.post(`/bookings/${id}/start`),
  stop: (id: string) => api.post(`/bookings/${id}/stop`),
  delete: (id: string) => api.delete(`/bookings/${id}`),
};

// Dashboard
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getActiveTasks: () => api.get('/dashboard/tasks/active'),
};

// Logs
export const logApi = {
  list: (params?: Record<string, string>) => api.get('/logs', { params }),
  export: (params?: Record<string, string>) =>
    api.get('/logs/export', { params, responseType: 'blob' }),
};

// Notifications
export const notificationApi = {
  getPreferences: () => api.get('/notifications'),
  updatePreference: (data: Record<string, unknown>) => api.put('/notifications', data),
  test: (type: string) => api.post('/notifications/test', { type }),
};

// Proxies
export const proxyApi = {
  list: () => api.get('/proxies'),
  create: (data: Record<string, unknown>) => api.post('/proxies', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/proxies/${id}`, data),
  delete: (id: string) => api.delete(`/proxies/${id}`),
};

export default api;
