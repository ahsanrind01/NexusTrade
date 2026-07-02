import axios, { AxiosError, AxiosRequestConfig } from 'axios';

const DEFAULT_TIMEOUT_MS = Number(process.env.API_REQUEST_TIMEOUT_MS || 5000);
const DEFAULT_RETRIES = Number(process.env.API_REQUEST_RETRIES || 2);
const BASE_BACKOFF_MS = Number(process.env.API_RETRY_BASE_DELAY_MS || 250);

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableError = (err: unknown): boolean => {
  const axiosErr = err as AxiosError;

  if (!axiosErr.response) {
    return true;
  }

  const status = axiosErr.response.status;
  return status === 408 || status === 429 || status >= 500;
};

const backoffDelay = (attempt: number): number => {
  const jitter = Math.random() * BASE_BACKOFF_MS;
  return BASE_BACKOFF_MS * 2 ** attempt + jitter;
};

export const requestWithRetry = async <T>(
  config: AxiosRequestConfig,
  retries = DEFAULT_RETRIES
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.request<T>({
        timeout: DEFAULT_TIMEOUT_MS,
        ...config
      });
      return response.data;
    } catch (err) {
      lastError = err;

      if (attempt >= retries || !isRetryableError(err)) {
        break;
      }

      await sleep(backoffDelay(attempt));
    }
  }

  throw lastError;
};

export const getErrorDetails = (err: unknown): string => {
  const maybeAggregate = err as { name?: string; errors?: unknown[] };
  if (maybeAggregate.name === 'AggregateError' && Array.isArray(maybeAggregate.errors)) {
    const nested = maybeAggregate.errors.map(error => getErrorDetails(error)).join('; ');
    return nested ? `AggregateError: ${nested}` : 'AggregateError';
  }

  const axiosErr = err as AxiosError<any>;
  const status = axiosErr.response?.status;
  const message = axiosErr.response?.data?.message || axiosErr.message || String(err);

  return status ? `status=${status} message=${message}` : message;
};
