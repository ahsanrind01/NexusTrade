export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export const normalizePhoneNumber = (phone: string) => {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d+]/g, '');

  if (digits.startsWith('+')) {
    return `+${digits.slice(1).replace(/\D/g, '')}`;
  }

  return digits.replace(/\D/g, '');
};

export const isValidPhoneNumber = (phone: string) =>
  /^\+[1-9]\d{7,14}$/.test(phone.trim());

export const isStrongPassword = (password: string) =>
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password);

export const isLikelyGoogleIdToken = (token: string) =>
  token.trim().split('.').length === 3;
