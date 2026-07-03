import { CONFIG } from '../constants/config';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const BASE_URL = CONFIG.BASE_URL;

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});