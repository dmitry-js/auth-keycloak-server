# Auth Keycloak Server

The **Auth Keycloak Server** is a Node.js-based authentication server designed to handle user authentication and API proxying for a Next.js frontend application. It integrates with **Keycloak** for OAuth 2.0/OpenID Connect authentication, uses **Redis** for caching user information, and proxies API requests to a backend service. The server ensures secure handling of access and refresh tokens, supports token refreshing, and provides endpoints for login, logout, and token validation.

This project is tailored for seamless integration with a **Next.js** frontend, enabling secure authentication flows and API communication in a full-stack application.

## Table of Contents
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Server](#running-the-server)
- [API Endpoints](#api-endpoints)
- [Integration with Next.js](#integration-with-nextjs)
- [Directory Structure](#directory-structure)
- [Dependencies](#dependencies)
- [Troubleshooting](#troubleshooting)

## Features
- **Keycloak Integration**: Handles OAuth 2.0/OpenID Connect flows (login, logout, token refresh).
- **Secure Token Management**: Stores `access_token` and `refresh_token` in HttpOnly cookies with `sameSite: lax`.
- **API Proxying**: Forwards requests from `/api/v1/*` to a backend API with proper authorization headers.
- **Redis Caching**: Optionally caches user information to reduce Keycloak requests.
- **Next.js Compatibility**: Designed to work with Next.js frontend, supporting CORS and cookie-based authentication.
- **Error Handling**: Robust handling of 401 errors with automatic token refresh.
- **Logging**: Basic request logging for debugging.

## Architecture
The Auth Keycloak Server acts as a middleware between a Next.js frontend and a backend API. It:
1. Authenticates users via Keycloak.
2. Manages access and refresh tokens in secure cookies.
3. Validates tokens and optionally caches user info in Redis.
4. Proxies API requests to the backend, injecting `Authorization: Bearer` headers.
5. Handles token refresh for expired access tokens.

The server is built with **Express.js**, uses **TypeScript** for type safety, and is modularized with utilities in `src/utils.ts`.

## Prerequisites
- **Node.js**: v18 or higher.
- **Keycloak**: Running instance (default: `http://localhost:8081`).
- **Redis** (optional): For caching user info, running instance (default: `localhost:6379`). If not used, the server falls back to Keycloak requests.
- **Backend API**: Running service (default: `http://localhost:8080/api/v1`).
- **Next.js Frontend**: Running at `http://localhost:3000` (optional for integration).
- **Docker** (optional): For running Keycloak/Redis in containers.

## Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/dmitry-js/auth-keycloak-server.git
   cd auth-keycloak-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory (see [Configuration](#configuration)).

4. (Optional) Start Redis if caching is needed:
   ```bash
   docker run -d -p 6379:6379 redis
   ```
   Alternatively, install and run Redis locally:
   ```bash
   redis-server
   ```
   If Redis is not running, the server will log warnings and proceed without caching.

## Configuration
Create a `.env` file with the following variables:

```env
# Keycloak configuration
KEYCLOAK_URL=http://localhost:8081
KEYCLOAK_REALM=your-realm
KEYCLOAK_CLIENT_ID=nextjs-app
KEYCLOAK_CLIENT_SECRET=your-secret

# Project configuration
BASE_URL=http://localhost:4000
APP_URL=http://localhost:3000
API_BASE_URL=http://localhost:8080/api/v1

# Redis configuration (optional)
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=your-password (if required)
```

- `KEYCLOAK_URL`: URL of the Keycloak server.
- `KEYCLOAK_REALM`: Keycloak realm (e.g., `dumper`).
- `KEYCLOAK_CLIENT_ID`: Client ID for the Next.js app in Keycloak.
- `KEYCLOAK_CLIENT_SECRET`: Client secret for secure token exchange.
- `BASE_URL`: Auth server URL (e.g., `http://localhost:4000`).
- `APP_URL`: Next.js frontend URL (e.g., `http://localhost:3000`).
- `API_BASE_URL`: Backend API URL (e.g., `http://localhost:8080/api/v1`).
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: Redis connection settings (optional; These are centralized in `src/utils.ts`.

Ensure Keycloak is configured with:
- A realm (e.g., `dumper`).
- A client (`nextjs-app`) with:
    - Client authentication enabled.
    - Valid redirect URI: `http://localhost:4000/auth/callback`.
    - Scopes: `openid`, `profile`, `email`.

## Running the Server
1. (Optional) Start Redis if caching is desired:
   ```bash
   docker run -d -p 6379:6379 redis
   ```

2. Start Keycloak (if not running):
   ```bash
   docker run -p 8081:8080 -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak:latest start-dev
   ```

3. Start the Auth Keycloak Server:
   ```bash
   npm start
   ```

The server runs on `http://localhost:4000`.

## API Endpoints
| Endpoint             | Method | Description                                                                 |
|----------------------|--------|-----------------------------------------------------------------------------|
| `/auth/login`        | GET    | Redirects to Keycloak login page.                                           |
| `/auth/callback`     | GET    | Handles Keycloak callback, sets `access_token` and `refresh_token` cookies. |
| `/auth/logout`       | GET    | Clears cookies and redirects to Keycloak logout.                            |
| `/auth/validate`     | GET    | Validates token, returns user info (optionally caches in Redis for 5 min).  |
| `/api/v1/*`          | ALL    | Proxies requests to `API_BASE_URL`, adding `Authorization: Bearer` header.  |

### Example Requests
- **Login**:
  ```bash
  curl http://localhost:4000/auth/login
  ```
  Redirects to Keycloak login.

- **Validate Token**:
  ```bash
  curl -H "Cookie: access_token=your_token" http://localhost:4000/auth/validate
  ```
  Response: `{ "isAuthenticated": true, "user": { ... } }`

- **API Proxy**:
  ```bash
  curl -H "Cookie: access_token=your_token" http://localhost:4000/api/v1/projects?limit=10
  ```
  Proxies to `http://localhost:8080/api/v1/projects?limit=10`.

## Integration with Next.js
The Auth Keycloak Server is designed to work with a **Next.js** frontend running at `http://localhost:3000`. Here's how to integrate:

### 1. CORS Setup
The server includes CORS middleware to allow requests from `APP_URL`:
```tsx
app.use(cors({
    origin: APP_URL,
    credentials: true
}));
```

### 2. Authentication Flow
- **Login**: Redirect users to `/auth/login` from your Next.js app:
  ```tsx
  // pages/login.tsx
  export default function Login() {
      return <a href="http://localhost:4000/auth/login">Login with Keycloak</a>;
  }
  ```
- After login, Keycloak redirects to `/auth/callback`, which sets cookies and redirects to `APP_URL`.

- **Validate User**:
  Use `/auth/validate` to check authentication status:
  ```tsx
  // lib/auth.ts
  export async function getUser() {
      const res = await fetch('http://localhost:4000/auth/validate', {
          credentials: 'include'
      });
      return res.json();
  }

  // pages/index.tsx
  import { getUser } from '../lib/auth';
  export default function Home({ user }) {
      return <div>{user.isAuthenticated ? `Welcome, ${user.user.name}` : 'Please log in'}</div>;
  }
  export async function getServerSideProps() {
      const user = await getUser();
      return { props: { user } };
  }
  ```

- **API Requests**:
  Make API calls through `/api/v1` to leverage the Auth Keycloak Server's proxy:
  ```tsx
  // lib/api.ts
  export async function fetchProjects() {
      const res = await fetch('http://localhost:4000/api/v1/projects?limit=10', {
          credentials: 'include'
      });
      return res.json();
  }
  ```

### 3. Logout
Redirect to `/auth/logout` to clear cookies and log out from Keycloak:
```tsx
// components/LogoutButton.tsx
export default function LogoutButton() {
    return <a href="http://localhost:4000/auth/logout">Logout</a>;
}
```

### 4. Handling Tokens
- The Auth Keycloak Server manages `access_token` and `refresh_token` in HttpOnly cookies, so Next.js only needs to include `credentials: 'include'` in fetch requests.
- If the `access_token` expires, the server automatically refreshes it using the `refresh_token` and retries the request.

## Directory Structure
```
auth-keycloak-server/
├── src/
│   ├── index.ts          # Main server logic (Express routes)
│   ├── utils.ts          # Constants and helper functions (e.g., refreshTokens)
├── .env                  # Environment variables
├── package.json          # Dependencies and scripts
├── README.md             # Project documentation
```

## Dependencies
- **express**: Web framework for routing and middleware.
- **axios**: HTTP client for Keycloak and API requests.
- **cookie-parser**: Parses cookies for token management.
- **cors**: Enables CORS for Next.js frontend.
- **dotenv**: Loads environment variables from `.env`.
- **ioredis**: Redis client for caching.

Install with:
```bash
npm install express axios cookie-parser cors dotenv ioredis
```

## Troubleshooting
- **Keycloak Redirect Fails**:
    - Ensure `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, and `KEYCLOAK_CLIENT_SECRET` are correct in `.env`.
    - Verify the client in Keycloak has the correct redirect URI (`http://localhost:4000/auth/callback`).

- **Redis Connection Error**:
    - Check if Redis is running via Docker Compose:
      ```bash
      docker ps
      redis-cli ping
      ```
      Expected output: `PONG`. If you see `Connection refused`, ensure `docker compose up` is выполнен.
    - Verify `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD` in `.env` match the Redis service in `docker-compose.yml`.
    - If Redis is unavailable, the server logs warnings (e.g., `Redis cache unavailable`) and continues without caching.
    - Note: Accessing `http://localhost:6379` in a browser will show `ERR_EMPTY_RESPONSE`, as Redis uses the RESP protocol, not HTTP.

- **API Proxy Fails**:
    - Verify `API_BASE_URL` matches your backend API.
    - Check logs for errors (`console.log` in `/api/v1` route).

- **CORS Issues**:
    - Ensure the Next.js frontend runs at the URL specified in `APP_URL`.
    - Update `cors` origin in `index.ts` if the frontend URL changes.

- **Token Refresh Fails**:
    - Confirm `refresh_token` is valid and not expired.
    - Check Keycloak logs for token endpoint errors.

For detailed debugging, enable additional logging:
```tsx
console.log('Request details:', req.method, req.url);
```
