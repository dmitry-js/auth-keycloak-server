declare namespace NodeJS {
    interface ProcessEnv {
        KEYCLOAK_CLIENT_SECRET: string;
        NODE_ENV: 'development' | 'production';
    }
}