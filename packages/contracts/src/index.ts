export type Role = 'CUSTOMER' | 'AGENT' | 'ADMIN';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
}
export interface AuthResponse {
  accessToken: string;
  user: User;
}
export interface Ticket {
  id: string;
  authorId: string;
  assignedAgentId: string | null;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
  messages?: TicketMessage[];
}
export interface TicketMessage {
  id: string;
  authorId: string;
  content: string;
  visibility: 'PUBLIC' | 'INTERNAL';
  createdAt: string;
}
export interface Session {
  id: string;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  current: boolean;
}
export interface AuditEvent {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface ApiError {
  error: { code: string; message: string; requestId: string; fields?: Record<string, string[]> };
}
