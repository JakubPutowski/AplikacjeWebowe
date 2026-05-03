import { inject, Injectable } from '@angular/core';
import { useAppStorage } from './app-storage';
import {
  LOCAL_ADMIN_EMAIL,
  LOCAL_ADMIN_LOGIN,
  LOCAL_ADMIN_PASSWORD,
  SUPER_ADMIN_EMAIL,
} from './auth.config';
import { NotificationPriority } from './notification.model';
import { NotificationService } from './notification.service';
import { ProjectModel, Story, StoryState, User, UserRole } from './project.model';
import { Task } from './task.model';

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
  private storage = useAppStorage();
  private notificationService = inject(NotificationService);

  private readonly LS_KEY = 'projects_data';
  private readonly STORIES_KEY = 'stories_data';
  private readonly CURRENT_PROJ_KEY = 'current_project_id';
  private readonly TASKS_KEY = 'tasks_data';
  private readonly USERS_KEY = 'users_data';
  private readonly CURRENT_USER_KEY = 'current_user_id';

  private projects: ProjectModel[] = [];
  private stories: Story[] = [];
  private tasks: Task[] = [];
  private users: User[] = [];
  private currentProjectId: string | null = null;
  private currentUserId: string | null = null;

  private initialized = false;
  private initializingPromise: Promise<void> | null = null;

  initialize(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    if (this.initializingPromise) return this.initializingPromise;

    this.initializingPromise = this.loadState().finally(() => {
      this.initializingPromise = null;
    });

    return this.initializingPromise;
  }

  getProjects(): ProjectModel[] {
    return [...this.projects];
  }

  saveProject(project: Omit<ProjectModel, 'id'>): void {
    const newProject = { ...project, id: crypto.randomUUID() };
    this.projects = [...this.projects, newProject];
    this.persistProjects();
    this.notifyProjectCreated(newProject.name);
  }

  deleteProject(id: string): void {
    this.projects = this.projects.filter((p) => p.id !== id);
    this.persistProjects();

    const storyIdsToDelete = this.stories
      .filter((s) => s.projectId === id)
      .map((s) => s.id);

    if (storyIdsToDelete.length > 0) {
      this.stories = this.stories.filter((s) => s.projectId !== id);
      this.persistStories();

      this.tasks = this.tasks.filter((t) => !storyIdsToDelete.includes(t.storyId));
      this.persistTasks();
    }

    if (this.currentProjectId === id) {
      this.currentProjectId = null;
      this.persistCurrentProjectId();
    }
  }

  setCurrentProjectId(id: string): void {
    this.currentProjectId = id;
    this.persistCurrentProjectId();
  }

  getCurrentProjectId(): string | null {
    return this.currentProjectId;
  }

  getUsers(): User[] {
    return [...this.users];
  }

  getCurrentUser(): User | null {
    if (!this.currentUserId) return null;
    return this.users.find((u) => u.id === this.currentUserId) ?? null;
  }

  clearCurrentUser(): void {
    this.currentUserId = null;
    this.persistCurrentUserId();
  }

  loginWithOAuth(profile: OAuthProfile): { user: User; isNew: boolean } {
    const normalizedEmail = profile.email.trim().toLowerCase();
    const now = new Date().toISOString();
    const name = this.resolveNames(profile);
    const users = [...this.users];
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
      this.users = users;
      this.currentUserId = updated.id;
      this.persistUsers();
      this.persistCurrentUserId();
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

    this.users = [...users, created];
    this.currentUserId = created.id;
    this.persistUsers();
    this.persistCurrentUserId();
    this.notifyNewUserCreated(created);

    return { user: created, isNew: true };
  }

  loginWithLocalAdmin(credentials: LocalAdminCredentials): { user: User; isNew: boolean } | null {
    const normalizedLogin = credentials.login.trim();
    if (normalizedLogin !== LOCAL_ADMIN_LOGIN || credentials.password !== LOCAL_ADMIN_PASSWORD) {
      return null;
    }

    const now = new Date().toISOString();
    const localAdminEmail = LOCAL_ADMIN_EMAIL.trim().toLowerCase();
    const users = [...this.users];
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
      this.users = users;
      this.currentUserId = updated.id;
      this.persistUsers();
      this.persistCurrentUserId();
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

    this.users = [...users, created];
    this.currentUserId = created.id;
    this.persistUsers();
    this.persistCurrentUserId();
    this.notifyNewUserCreated(created);
    return { user: created, isNew: true };
  }

  updateUserRole(userId: string, role: UserRole): void {
    const users = [...this.users];
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return;

    users[idx] = this.isProtectedAdminEmail(users[idx].email)
      ? { ...users[idx], role: 'admin' }
      : { ...users[idx], role };

    this.users = users;
    this.persistUsers();
  }

  setUserBlocked(userId: string, isBlocked: boolean): void {
    const users = [...this.users];
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return;
    if (this.isProtectedAdminEmail(users[idx].email)) return;

    users[idx] = { ...users[idx], isBlocked };
    this.users = users;
    this.persistUsers();
  }

  getAdminIds(): string[] {
    return this.users.filter((user) => user.role === 'admin').map((user) => user.id);
  }

  getStories(): Story[] {
    return [...this.stories];
  }

  getStoriesForProject(projectId: string): Story[] {
    return this.stories.filter((s) => s.projectId === projectId);
  }

  addStory(story: Omit<Story, 'id' | 'createdAt'>): void {
    const newStory: Story = {
      ...story,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };

    this.stories = [...this.stories, newStory];
    this.persistStories();
    this.notifyStoryAssigned(newStory);
  }

  deleteStory(storyId: string): void {
    this.stories = this.stories.filter((s) => s.id !== storyId);
    this.persistStories();

    this.tasks = this.tasks.filter((t) => t.storyId !== storyId);
    this.persistTasks();
  }

  getTasks(): Task[] {
    return [...this.tasks];
  }

  getTasksForStory(storyId: string): Task[] {
    return this.tasks.filter((t) => t.storyId === storyId);
  }

  getTask(taskId: string): Task | null {
    return this.tasks.find((t) => t.id === taskId) ?? null;
  }

  addTask(
    task: Omit<
      Task,
      'id' | 'addedAt' | 'startAt' | 'endAt' | 'actualHours' | 'state' | 'responsibleUserId'
    >,
  ): void {
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

    this.tasks = [...this.tasks, newTask];
    this.persistTasks();
    this.recalcStoryState(newTask.storyId);
    this.notifyTaskAdded(newTask);
  }

  deleteTask(taskId: string): void {
    const task = this.getTask(taskId);
    if (!task) return;

    this.tasks = this.tasks.filter((t) => t.id !== taskId);
    this.persistTasks();
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

    this.tasks = this.tasks.map((t) => (t.id === taskId ? updated : t));
    this.persistTasks();
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

    this.tasks = this.tasks.map((t) => (t.id === taskId ? updated : t));
    this.persistTasks();
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
      newState = 'doing';
    }

    const idx = this.stories.findIndex((s) => s.id === storyId);
    if (idx === -1) return;
    if (this.stories[idx].state === newState) return;

    const stories = [...this.stories];
    stories[idx] = { ...stories[idx], state: newState };
    this.stories = stories;
    this.persistStories();
  }

  private notifyProjectCreated(projectName: string): void {
    const adminIds = this.users.filter((user) => user.role === 'admin').map((user) => user.id);
    void this.notificationService.sendToUsers(adminIds, {
      title: 'Utworzono nowy projekt',
      message: `Projekt "${projectName}" został utworzony.`,
      priority: 'high',
    });
  }

  private notifyStoryAssigned(story: Story): void {
    void this.notificationService.sendToUser({
      title: 'Przypisanie do historyjki',
      message: `Zostałeś przypisany do historyjki "${story.name}".`,
      priority: this.mapDomainPriority(story.priority),
      recipientId: story.ownerId,
    });
  }

  private notifyTaskAssigned(task: Task): void {
    if (!task.responsibleUserId) return;

    void this.notificationService.sendToUser({
      title: 'Przypisanie do zadania',
      message: `Przypisano Ci zadanie "${task.name}".`,
      priority: this.mapDomainPriority(task.priority),
      recipientId: task.responsibleUserId,
    });
  }

  private notifyTaskAdded(task: Task): void {
    const story = this.stories.find((item) => item.id === task.storyId);
    if (!story) return;

    void this.notificationService.sendToUser({
      title: 'Nowe zadanie w historyjce',
      message: `Dodano zadanie "${task.name}" w historyjce "${story.name}".`,
      priority: this.mapDomainPriority(task.priority),
      recipientId: story.ownerId,
    });
  }

  private notifyTaskDeleted(task: Task): void {
    const story = this.stories.find((item) => item.id === task.storyId);
    if (!story) return;

    void this.notificationService.sendToUser({
      title: 'Usunięto zadanie z historyjki',
      message: `Usunięto zadanie "${task.name}" z historyjki "${story.name}".`,
      priority: this.mapDomainPriority(task.priority),
      recipientId: story.ownerId,
    });
  }

  private notifyTaskStatusChanged(task: Task, nextState: 'doing' | 'done'): void {
    const story = this.stories.find((item) => item.id === task.storyId);
    if (!story) return;

    const priority = nextState === 'done' ? 'medium' : 'low';
    const statusLabel = nextState === 'done' ? 'DONE' : 'DOING';

    void this.notificationService.sendToUser({
      title: 'Zmiana statusu zadania',
      message: `Zadanie "${task.name}" zmieniło status na ${statusLabel}.`,
      priority,
      recipientId: story.ownerId,
    });
  }

  private notifyNewUserCreated(user: User): void {
    const adminIds = this.getAdminIds().filter((id) => id !== user.id);
    if (adminIds.length === 0) return;

    void this.notificationService.sendToUsers(adminIds, {
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

    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
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

  private async loadState(): Promise<void> {
    this.projects = await this.storage.get<ProjectModel[]>(this.LS_KEY, []);
    this.stories = await this.storage.get<Story[]>(this.STORIES_KEY, []);
    this.tasks = await this.storage.get<Task[]>(this.TASKS_KEY, []);

    const rawUsers = await this.storage.get<unknown[]>(this.USERS_KEY, []);
    this.users = rawUsers.map((item) => this.normalizeUser(item)).filter((item): item is User => item !== null);
    void this.storage.set(this.USERS_KEY, this.users);

    const currentProjectId = await this.storage.get<string | null>(this.CURRENT_PROJ_KEY, null);
    this.currentProjectId = typeof currentProjectId === 'string' ? currentProjectId : null;

    const currentUserId = await this.storage.get<string | null>(this.CURRENT_USER_KEY, null);
    this.currentUserId = typeof currentUserId === 'string' ? currentUserId : null;

    this.initialized = true;
  }

  private persistProjects(): void {
    void this.storage.set(this.LS_KEY, this.projects);
  }

  private persistStories(): void {
    void this.storage.set(this.STORIES_KEY, this.stories);
  }

  private persistTasks(): void {
    void this.storage.set(this.TASKS_KEY, this.tasks);
  }

  private persistUsers(): void {
    void this.storage.set(this.USERS_KEY, this.users);
  }

  private persistCurrentProjectId(): void {
    if (!this.currentProjectId) {
      void this.storage.remove(this.CURRENT_PROJ_KEY);
      return;
    }

    void this.storage.set(this.CURRENT_PROJ_KEY, this.currentProjectId);
  }

  private persistCurrentUserId(): void {
    if (!this.currentUserId) {
      void this.storage.remove(this.CURRENT_USER_KEY);
      return;
    }

    void this.storage.set(this.CURRENT_USER_KEY, this.currentUserId);
  }
}
