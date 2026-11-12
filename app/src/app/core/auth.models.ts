export interface User {
  id: string;
  email: string;
  fullName: string;
  emailConfirmed: boolean;
  roles: string[];
}

export interface AuthResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: User;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
}
