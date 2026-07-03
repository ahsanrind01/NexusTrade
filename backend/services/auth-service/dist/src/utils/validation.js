"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLikelyGoogleIdToken = exports.isStrongPassword = exports.isValidPhoneNumber = exports.normalizePhoneNumber = exports.isValidEmail = exports.normalizeEmail = void 0;
const normalizeEmail = (email) => email.trim().toLowerCase();
exports.normalizeEmail = normalizeEmail;
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
exports.isValidEmail = isValidEmail;
const normalizePhoneNumber = (phone) => {
    const trimmed = phone.trim();
    const digits = trimmed.replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) {
        return `+${digits.slice(1).replace(/\D/g, '')}`;
    }
    return digits.replace(/\D/g, '');
};
exports.normalizePhoneNumber = normalizePhoneNumber;
const isValidPhoneNumber = (phone) => /^\+[1-9]\d{7,14}$/.test(phone.trim());
exports.isValidPhoneNumber = isValidPhoneNumber;
const isStrongPassword = (password) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password);
exports.isStrongPassword = isStrongPassword;
const isLikelyGoogleIdToken = (token) => token.trim().split('.').length === 3;
exports.isLikelyGoogleIdToken = isLikelyGoogleIdToken;
