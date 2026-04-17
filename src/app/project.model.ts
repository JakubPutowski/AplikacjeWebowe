export interface ProjectModel {
  id: string;
  name: string;
  description: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isBlocked: boolean;
  createdAt: string;
  lastLoginAt: string;
}

export type UserRole = 'admin' | 'devops' | 'developer' | 'guest';

export type StoryPriority = 'niski' | 'średni' | 'wysoki';
export type StoryState = 'todo' | 'doing' | 'done';

export interface Story {
  id: string;
  name: string;
  description: string;
  priority: StoryPriority;
  projectId: string;
  createdAt: Date;
  state: StoryState;
  ownerId: string;
}
