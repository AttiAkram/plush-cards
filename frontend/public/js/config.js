/**
 * config.js — Runtime configuration.
 *
 * BACKEND_URL:
 *   - Local / Docker:  leave as '' (nginx on same origin proxies /api and /socket.io)
 *   - Vercel + Railway: set to your Railway backend URL, e.g.
 *                       'https://plush-backend.up.railway.app'
 *
 * After deploying the backend to Railway, paste the URL here and push — Vercel
 * will automatically redeploy the frontend with the correct value.
 */
export const BACKEND_URL = '';
