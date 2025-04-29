import axios from 'axios';
import { Response } from 'express';
import { URLSearchParams } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// Keycloak config
export const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8081';
export const REALM = process.env.KEYCLOAK_REALM || 'dumper';
export const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'nextjs-app';
export const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || 'your-secret';

// Project config
export const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
export const REDIRECT_URI = `${BASE_URL}/auth/callback`;
export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080/api/v1';
export const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Redis config
export const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
export const REDIS_PORT = parseInt(process.env.REDIS_PORT) || 6379;
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// Helper: Refresh tokens
export async function refreshTokens(refreshToken: string, res: Response): Promise<{ access_token: string, refresh_token: string } | null> {
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('client_id', CLIENT_ID);
        params.append('client_secret', CLIENT_SECRET);
        params.append('refresh_token', refreshToken);

        const { data } = await axios.post(
            `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
            params.toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        res.cookie('access_token', data.access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 3600 * 1000,
            path: '/',
        });
        res.cookie('refresh_token', data.refresh_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: data.refresh_expires_in * 1000 || 30 * 24 * 3600 * 1000,
            path: '/',
        });

        return { access_token: data.access_token, refresh_token: data.refresh_token };
    } catch (error) {
        console.error('Refresh token error:', error);
        return null;
    }
}