import express from 'express';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import Redis from 'ioredis';
import {
    KEYCLOAK_URL,
    REALM,
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI,
    API_BASE_URL,
    APP_URL,
    refreshTokens,
} from './utils';

const app = express();
const redis = new Redis();

// Middleware
app.use(cookieParser());
app.use(cors({
    origin: APP_URL,
    credentials: true
}));
app.use(express.json());

// 1. Login redirect
app.get('/auth/login', (req, res) => {
    const authUrl = new URL(`${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/auth`);
    authUrl.searchParams.append('client_id', CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'openid profile email');

    res.redirect(authUrl.toString());
});

// 2. Callback handler
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Invalid authorization code' });
    }

    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('client_id', CLIENT_ID);
        params.append('client_secret', CLIENT_SECRET);
        params.append('code', code);
        params.append('redirect_uri', REDIRECT_URI);

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

        res.redirect(APP_URL);
    } catch (error) {
        console.error('Token exchange error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// 3. Logout route
app.get('/auth/logout', (req, res) => {
    res.clearCookie('access_token', { path: '/', sameSite: 'lax' });
    res.clearCookie('refresh_token', { path: '/', sameSite: 'lax' });

    const logoutUrl = new URL(`${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/logout`);
    logoutUrl.searchParams.append('post_logout_redirect_uri', APP_URL);
    logoutUrl.searchParams.append('client_id', CLIENT_ID);

    res.redirect(logoutUrl.toString());
});

// 4. Validate route
app.get('/auth/validate', async (req, res) => {
    let token = req.cookies.access_token || req.headers.cookie?.match(/access_token=([^;]+)/)?.[1];
    const refreshToken = req.cookies.refresh_token || req.headers.cookie?.match(/refresh_token=([^;]+)/)?.[1];

    if (!token) {
        return res.status(401).json({ isAuthenticated: false });
    }

    const cacheKey = `userinfo:${token}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
        return res.json(JSON.parse(cached));
    }

    try {
        const response = await axios.get(
            `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/userinfo`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = { isAuthenticated: true, user: response.data };
        await redis.set(cacheKey, JSON.stringify(data), 'EX', 300);
        res.json(data);
    } catch (error: any) {
        if (error.response?.status === 401 && refreshToken) {
            const tokens = await refreshTokens(refreshToken, res);
            if (!tokens) {
                return res.status(401).json({ isAuthenticated: false });
            }

            try {
                const response = await axios.get(
                    `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/userinfo`,
                    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
                );
                const newData = { isAuthenticated: true, user: response.data };
                await redis.set(`userinfo:${tokens.access_token}`, JSON.stringify(newData), 'EX', 300);
                res.json(newData);
            } catch (retryError) {
                console.error('Retry userinfo error:', retryError);
                res.status(401).json({ isAuthenticated: false });
            }
        } else {
            console.error('Userinfo error:', error.response?.status, error.message);
            res.status(401).json({ isAuthenticated: false });
        }
    }
});

// 5. Proxy API
app.use('/api/v1', async (req, res) => {
    const token = req.cookies.access_token;
    const refreshToken = req.cookies.refresh_token;

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const apiPath = req.originalUrl.replace('/api/v1', '') || '';
        console.log(`Proxying request: ${req.method} ${API_BASE_URL}${apiPath}`);
        const response = await axios({
            method: req.method,
            url: `${API_BASE_URL}${apiPath}`,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            data: req.body,
            params: req.query,
        });
        res.json(response.data);
    } catch (error: any) {
        if (error.response?.status === 401 && refreshToken) {
            const tokens = await refreshTokens(refreshToken, res);
            if (!tokens) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            try {
                const apiPath = req.originalUrl.replace('/api/v1', '') || '';
                console.log(`Retrying request: ${req.method} ${API_BASE_URL}${apiPath}`);
                const retryResponse = await axios({
                    method: req.method,
                    url: `${API_BASE_URL}${apiPath}`,
                    headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
                    data: req.body,
                    params: req.query,
                });
                res.json(retryResponse.data);
            } catch (retryError) {
                console.error('Retry API error:', retryError);
                res.status(401).json({ error: 'Unauthorized' });
            }
        } else {
            console.error('API error:', error.response?.status, error.message);
            res.status(error.response?.status || 500).json({ error: 'API error' });
        }
    }
});

// Server startup
const PORT = 4000;
app.listen(PORT, () => {
    console.log(`Auth server running on http://localhost:${PORT}`);
});