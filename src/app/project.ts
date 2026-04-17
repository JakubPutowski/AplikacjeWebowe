import { inject, Injectable } from '@angular/core';
import { ProjectModel, Story, StoryState, User, UserRole } from './project.model';
import { Task } from './task.model';
import { NotificationPriority } from './notification.model';
import { NotificationService } from './notification.service';
import {
  LOCAL_ADMIN_EMAIL,
  LOCAL_ADMIN_LOGIN,
  LOCAL_ADMIN_PASSWORD,
  SUPER_ADMIN_EMAIL,
} from './auth.config';

type OAuthProfile = {
  email: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
};

type LocalAdminCredentials = {
  login: string;
  password: string;
};

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private notificationService = inject(NotificationService);

  private readonly LS_KEY = 'projects_data';
  private readonly STORIES_KEY = 'stories_data';
  private readonly CURRENT_PROJ_KEY = 'current_project_id';

  private readonly TASKS_KEY = 'tasks_data';
  private readonly USERS_KEY = 'users_data';
  private readonly CURRENT_USER_KEY = 'current_user_id';

  private getFromStorage<T>(key: string, fallback: T): T {
    const data = localStorage.getItem(key);
    if (!data) return fallback;
    try {
      return JSON.parse(data) as T;
    } catch {
      return fallback;
    }
  }

  private setToStorage<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  getProjects(): ProjectModel[] {
    return this.getFromStorage<ProjectModel[]>(this.LS_KEY, []);
  }

  saveProject(project: Omit<ProjectModel, 'id'>): void {
    const projects = this.getProjects();
    const newProject = { ...project, id: crypto.randomUUID() };
    this.setToStorage(this.LS_KEY, [...projects, newProject]);

    this.notifyProjectCreated(newProject.name);
  }

  deleteProject(id: string): void {
    const projects = this.getProjects().filter((p) => p.id !== id);
    this.setToStorage(this.LS_KEY, projects);

    // Cascade: usuwamy powiązane story oraz zadania.
    const storyIdsToDelete = this.getStories()
      .filter((s) => s.projectId === id)
      .map((s) => s.id);
    if (storyIdsToDelete.length > 0) {
      const storiesRemaining = this.getStories().filter((s) => s.projectId !== id);
      this.setToStorage(this.STORIES_KEY, storiesRemaining);

      const tasksRemaining = this.getTasks().filter((t) => !storyIdsToDelete.includes(t.storyId));
      this.setToStorage(this.TASKS_KEY, tasksRemaining);
    }

    const currentProjectId = this.getCurrentProjectId();
    if (currentProjectId === id) {
      localStorage.removeItem(this.CURRENT_PROJ_KEY);
    }
  }

  setCurrentProjectId(id: string): void {
    localStorage.setItem(this.CURRENT_PROJ_KEY, id);
  }

  getCurrentProjectId(): string | null {
    return localStorage.getItem(this.CURRENT_PROJ_KEY);
  }

  // Users / auth (lokalnie)
  getUsers(): User[] {
    const rawUsers = this.getFromStorage<unknown[]>(this.USERS_KEY, []);
    const normalizedUsers = rawUsers
      .map((item) => this.normalizeUser(item))
      .filter((item): item is User => item !== null);

    this.setToStorage(this.USERS_KEY, normalizedUsers);
    return normalizedUsers;
  }

  getCurrentUser(): User | null {
    const users = this.getUsers();
    const currentId = localStorage.getItem(this.CURRENT_USER_KEY);
    if (!currentId) return null;
    return users.find((u) => u.id === currentId) ?? null;
  }

  clearCurrentUser(): void {
    localStorage.removeItem(this.CURRENT_USER_KEY);
  }

  loginWithOAuth(profile: OAuthProfile): { user: User; isNew: boolean } {
    const normalizedEmail = profile.email.trim().toLowerCase();
    const users = this.getUsers();
    const now = new Date().toISOString();

    const name = this.resolveNames(profile);
    const existingIdx = users.findIndex((user) => user.email.toLowerCase() === normalizedEmail);

    if (existingIdx !== -1) {
      const current = users[existingIdx];
      const updated: User = {
        ...current,
        firstName: name.firstName,
        lastName: name.lastName,
        role: this.isSuperAdminEmail(normalizedEmail) ? 'admin' : current.role,
        lastLoginAt: now,
      };

      users[existingIdx] = updated;
      this.setToStorage(this.USERS_KEY, users);
      localStorage.setItem(this.CURRENT_USER_KEY, updated.id);

      return { user: updated, isNew: false };
    }

    const created: User = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      firstName: name.firstName,
      lastName: name.lastName,
      role: this.isSuperAdminEmail(normalizedEmail) ? 'admin' : 'guest',
      isBlocked: false,
      createdAt: now,
      lastLoginAt: now,
    };

    const next = [...users, created];
    this.setToStorage(this.USERS_KEY, next);
    localStorage.setItem(this.CURRENT_USER_KEY, created.id);

    this.notifyNewUserCreated(created);

    return { user: created, isNew: true };
  }

  loginWithLocalAdmin(credentials: LocalAdminCredentials): { user: User; isNew: boolean } | null {
    const normalizedLogin = credentials.login.trim();
    if (normalizedLogin !== LOCAL_ADMIN_LOGIN || credentials.password !== LOCAL_ADMIN_PASSWORD) {
      return null;
    }

    const users = this.getUsers();
    const now = new Date().toISOString();
    const localAdminEmail = LOCAL_ADMIN_EMAIL.trim().toLowerCase();
    const existingIdx = users.findIndex((user) => user.email.toLowerCase() === localAdminEmail);

    if (existingIdx !== -1) {
      const current = users[existingIdx];
      const updated: User = {
        ...current,
        email: localAdminEmail,
        firstName: 'Local',
        lastName: 'Admin',
        role: 'admin',
        isBlocked: false,
        lastLoginAt: now,
      };

      users[existingIdx] = updated;
      this.setToStorage(this.USERS_KEY, users);
      localStorage.setItem(this.CURRENT_USER_KEY, updated.id);
      return { user: updated, isNew: false };
    }

    const created: User = {
      id: crypto.randomUUID(),
      email: localAdminEmail,
      firstName: 'Local',
      lastName: 'Admin',
      role: 'admin',
      isBlocked: false,
      createdAt: now,
      lastLoginAt: now,
    };

    const next = [...users, created];
    this.setToStorage(this.USERS_KEY, next);
    localStorage.setItem(this.CURRENT_USER_KEY, created.id);

    this.notifyNewUserCreated(created);

    return { user: created, isNew: true };
  }

  updateUserRole(userId: string, role: UserRole): void {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return;

    if (this.isProtectedAdminEmail(users[idx].email)) {
      users[idx] = { ...users[idx], role: 'admin' };
    } else {
      users[idx] = { ...users[idx], role };
    }

    this.setToStorage(this.USERS_KEY, users);
  }

  setUserBlocked(userId: string, isBlocked: boolean): void {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return;

    if (this.isProtectedAdminEmail(users[idx].email)) return;

    users[idx] = { ...users[idx], isBlocked };
    this.setToStorage(this.USERS_KEY, users);
  }

  getAdminIds(): string[] {
    return this.getUsers()
      .filter((user) => user.role === 'admin')
      .map((user) => user.id);
  }

  // Stories
  getStories(): Story[] {
    return this.getFromStorage<Story[]>(this.STORIES_KEY, []);
  }

  getStoriesForProject(projectId: string): Story[] {
    return this.getStories().filter((s) => s.projectId === projectId);
  }

  addStory(story: Omit<Story, 'id' | 'createdAt'>): void {
    const all = this.getStories();
    const newStory: Story = {
      ...story,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };
    this.setToStorage(this.STORIES_KEY, [...all, newStory]);

    this.notifyStoryAssigned(newStory);
  }

  deleteStory(storyId: string): void {
    const allStories = this.getStories();
    const filteredStories = allStories.filter((s) => s.id !== storyId);
    this.setToStorage(this.STORIES_KEY, filteredStories);

    // Cascade: usuń też zadania przypisane do story.
    const filteredTasks = this.getTasks().filter((t) => t.storyId !== storyId);
    this.setToStorage(this.TASKS_KEY, filteredTasks);
  }

  // Tasks
  getTasks(): Task[] {
    return this.getFromStorage<Task[]>(this.TASKS_KEY, []);
  }

  getTasksForStory(storyId: string): Task[] {
    return this.getTasks().filter((t) => t.storyId === storyId);
  }

  getTask(taskId: string): Task | null {
    return this.getTasks().find((t) => t.id === taskId) ?? null;
  }

  addTask(
    task: Omit<
      Task,
      'id' | 'addedAt' | 'startAt' | 'endAt' | 'actualHours' | 'state' | 'responsibleUserId'
    >,
  ): void {
    const all = this.getTasks();
    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      addedAt: new Date().toISOString(),
      state: 'todo',
      startAt: null,
      endAt: null,
      actualHours: null,
      responsibleUserId: null,
    };
    this.setToStorage(this.TASKS_KEY, [...all, newTask]);
    // Po dodaniu zadania story musi się przeliczyć:
    // jeśli historyjka była w `done`, dodanie nowego taska (todo) ma ją cofnąć do `doing`.
    this.recalcStoryState(newTask.storyId);

    this.notifyTaskAdded(newTask);
  }

  deleteTask(taskId: string): void {
    const task = this.getTask(taskId);
    if (!task) return;

    const filtered = this.getTasks().filter((t) => t.id !== taskId);
    this.setToStorage(this.TASKS_KEY, filtered);

    this.recalcStoryState(task.storyId);

    this.notifyTaskDeleted(task);
  }

  startTask(taskId: string, userId: string): void {
    const task = this.getTask(taskId);
    if (!task || task.state !== 'todo') return;

    const nowIso = new Date().toISOString();
    const updated: Task = {
      ...task,
      state: 'doing',
      responsibleUserId: userId,
      startAt: nowIso,
      endAt: null,
      actualHours: null,
    };

    const all = this.getTasks();
    const next = all.map((t) => (t.id === taskId ? updated : t));
    this.setToStorage(this.TASKS_KEY, next);

    this.recalcStoryState(task.storyId);

    this.notifyTaskAssigned(updated);
    this.notifyTaskStatusChanged(updated, 'doing');
  }

  completeTask(taskId: string): void {
    const task = this.getTask(taskId);
    if (!task || task.state !== 'doing' || !task.startAt) return;

    const end = new Date();
    const start = new Date(task.startAt);

    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    const roundedHours = Math.round(hours * 100) / 100;

    const updated: Task = {
      ...task,
      state: 'done',
      endAt: end.toISOString(),
      actualHours: roundedHours,
    };

    const all = this.getTasks();
    const next = all.map((t) => (t.id === taskId ? updated : t));
    this.setToStorage(this.TASKS_KEY, next);

    this.recalcStoryState(task.storyId);

    this.notifyTaskStatusChanged(updated, 'done');
  }

  private recalcStoryState(storyId: string): void {
    const tasks = this.getTasksForStory(storyId);

    let newState: StoryState = 'todo';
    if (tasks.length === 0) {
      newState = 'todo';
    } else if (tasks.every((t) => t.state === 'done')) {
      newState = 'done';
    } else if (tasks.every((t) => t.state === 'todo')) {
      newState = 'todo';
    } else {
      // Co najmniej jedno zadanie jest w doing lub done, ale nie wszystkie są done.
      newState = 'doing';
    }

    const stories = this.getStories();
    const idx = stories.findIndex((s) => s.id === storyId);
    if (idx === -1) return;

    if (stories[idx].state === newState) return;
    stories[idx] = { ...stories[idx], state: newState };
    this.setToStorage(this.STORIES_KEY, stories);
  }

  private notifyProjectCreated(projectName: string): void {
    const adminIds = this.getUsers()
      .filter((user) => user.role === 'admin')
      .map((user) => user.id);

    this.notificationService.sendToUsers(adminIds, {
      title: 'Utworzono nowy projekt',
      message: `Projekt \"${projectName}\" został utworzony.`,
      priority: 'high',
    });
  }

  private notifyStoryAssigned(story: Story): void {
    this.notificationService.sendToUser({
      title: 'Przypisanie do historyjki',
      message: `Zostałeś przypisany do historyjki \"${story.name}\".`,
      priority: this.mapDomainPriority(story.priority),
      recipientId: story.ownerId,
    });
  }

  private notifyTaskAssigned(task: Task): void {
    if (!task.responsibleUserId) return;

    this.notificationService.sendToUser({
      title: 'Przypisanie do zadania',
      message: `Przypisano Ci zadanie \"${task.name}\".`,
      priority: this.mapDomainPriority(task.priority),
      recipientId: task.responsibleUserId,
    });
  }

  private notifyTaskAdded(task: Task): void {
    const story = this.getStories().find((item) => item.id === task.storyId);
    if (!story) return;

    this.notificationService.sendToUser({
      title: 'Nowe zadanie w historyjce',
      message: `Dodano zadanie \"${task.name}\" w historyjce \"${story.name}\".`,
      priority: this.mapDomainPriority(task.priority),
      recipientId: story.ownerId,
    });
  }

  private notifyTaskDeleted(task: Task): void {
    const story = this.getStories().find((item) => item.id === task.storyId);
    if (!story) return;

    this.notificationService.sendToUser({
      title: 'Usunięto zadanie z historyjki',
      message: `Usunięto zadanie \"${task.name}\" z historyjki \"${story.name}\".`,
      priority: this.mapDomainPriority(task.priority),
      recipientId: story.ownerId,
    });
  }

  private notifyTaskStatusChanged(task: Task, nextState: 'doing' | 'done'): void {
    const story = this.getStories().find((item) => item.id === task.storyId);
    if (!story) return;

    const priority = nextState === 'done' ? 'medium' : 'low';
    const statusLabel = nextState === 'done' ? 'DONE' : 'DOING';

    this.notificationService.sendToUser({
      title: 'Zmiana statusu zadania',
      message: `Zadanie \"${task.name}\" zmieniło status na ${statusLabel}.`,
      priority,
      recipientId: story.ownerId,
    });
  }

  private notifyNewUserCreated(user: User): void {
    const adminIds = this.getAdminIds().filter((id) => id !== user.id);
    if (adminIds.length === 0) return;

    this.notificationService.sendToUsers(adminIds, {
      title: 'Tworzenie nowego konta w systemie',
      message: `Użytkownik ${user.firstName} ${user.lastName} (${user.email}) utworzył konto.`,
      priority: 'high',
    });
  }

  private normalizeUser(input: unknown): User | null {
    if (!input || typeof input !== 'object') return null;

    const record = input as Record<string, unknown>;
    if (
      typeof record['id'] !== 'string' ||
      typeof record['email'] !== 'string' ||
      typeof record['firstName'] !== 'string' ||
      typeof record['lastName'] !== 'string' ||
      !this.isUserRole(record['role']) ||
      typeof record['isBlocked'] !== 'boolean' ||
      typeof record['createdAt'] !== 'string' ||
      typeof record['lastLoginAt'] !== 'string'
    ) {
      return null;
    }

    return {
      id: record['id'],
      email: record['email'].trim().toLowerCase(),
      firstName: record['firstName'].trim() || 'Użytkownik',
      lastName: record['lastName'].trim() || 'Systemu',
      role: this.isProtectedAdminEmail(record['email']) ? 'admin' : record['role'],
      isBlocked: this.isProtectedAdminEmail(record['email']) ? false : record['isBlocked'],
      createdAt: record['createdAt'],
      lastLoginAt: record['lastLoginAt'],
    };
  }

  private isUserRole(value: unknown): value is UserRole {
    return value === 'admin' || value === 'devops' || value === 'developer' || value === 'guest';
  }

  private resolveNames(profile: OAuthProfile): { firstName: string; lastName: string } {
    const firstNameFromProfile = profile.firstName?.trim();
    const lastNameFromProfile = profile.lastName?.trim();

    if (firstNameFromProfile) {
      return {
        firstName: firstNameFromProfile,
        lastName: lastNameFromProfile || 'Użytkownik',
      };
    }

    const fullName = (profile.fullName ?? '').trim();
    if (!fullName) {
      return { firstName: 'Użytkownik', lastName: 'Systemu' };
    }

    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: 'Użytkownik' };
    }

    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    return { firstName, lastName };
  }

  private isSuperAdminEmail(email: string): boolean {
    return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.trim().toLowerCase();
  }

  private isLocalAdminEmail(email: string): boolean {
    return email.trim().toLowerCase() === LOCAL_ADMIN_EMAIL.trim().toLowerCase();
  }

  private isProtectedAdminEmail(email: string): boolean {
    return this.isSuperAdminEmail(email) || this.isLocalAdminEmail(email);
  }

  private mapDomainPriority(value: 'niski' | 'średni' | 'wysoki'): NotificationPriority {
    if (value === 'wysoki') return 'high';
    if (value === 'średni') return 'medium';
    return 'low';
  }
}
