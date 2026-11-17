export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleSignInResponse {
  accessToken: string;
  expiresIn: number;
  user: PublicUser;
}

export interface SignedInSession {
  user: PublicUser;
  expiresAt: number;
}
