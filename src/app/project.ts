import { Injectable } from '@angular/core';
import { ProjectModel, Story, StoryState, User } from './project.model';
import { Task } from './task.model';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private LS_KEY = 'projects_data';
  private STORIES_KEY = 'stories_data';
  private CURRENT_PROJ_KEY = 'current_project_id';

  private TASKS_KEY = 'tasks_data';
  private USERS_KEY = 'users_data';
  private CURRENT_USER_KEY = 'current_user_id';

  private ensureUsersSeeded(): void {
    const existingUsersRaw = localStorage.getItem(this.USERS_KEY);

    // Seed users only once.
    if (!existingUsersRaw) {
      const initialUsers: User[] = [
        { id: 'u_admin', firstName: 'Admin', lastName: 'Systemu', role: 'admin' },
        { id: 'u_devops', firstName: 'Devops', lastName: 'User', role: 'devops' },
        { id: 'u_developer', firstName: 'Developer', lastName: 'User', role: 'developer' },
      ];

      localStorage.setItem(this.USERS_KEY, JSON.stringify(initialUsers));
      // Standardowo admin na pierwszym uruchomieniu.
      localStorage.setItem(this.CURRENT_USER_KEY, 'u_admin');
      return;
    }

    // After seeding: keep current user stable, only fallback to admin when missing/invalid.
    const currentId = localStorage.getItem(this.CURRENT_USER_KEY);
    if (!currentId) {
      localStorage.setItem(this.CURRENT_USER_KEY, 'u_admin');
      return;
    }

    try {
      const users = JSON.parse(existingUsersRaw) as User[];
      if (!users.some((u) => u.id === currentId)) {
        localStorage.setItem(this.CURRENT_USER_KEY, 'u_admin');
      }
    } catch {
      localStorage.setItem(this.CURRENT_USER_KEY, 'u_admin');
    }
  }

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
    this.ensureUsersSeeded();
    return this.getFromStorage<User[]>(this.USERS_KEY, []);
  }

  getCurrentUser(): User {
    this.ensureUsersSeeded();
    const users = this.getUsers();
    const currentId = localStorage.getItem(this.CURRENT_USER_KEY);
    return users.find((u) => u.id === currentId) ?? users[0];
  }

  setCurrentUserId(id: string): void {
    this.ensureUsersSeeded();
    const users = this.getUsers();
    if (!users.some((u) => u.id === id)) return;
    localStorage.setItem(this.CURRENT_USER_KEY, id);
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
    task: Omit<Task, 'id' | 'addedAt' | 'startAt' | 'endAt' | 'actualHours' | 'state' | 'responsibleUserId'>
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
  }

  deleteTask(taskId: string): void {
    const task = this.getTask(taskId);
    if (!task) return;

    const filtered = this.getTasks().filter((t) => t.id !== taskId);
    this.setToStorage(this.TASKS_KEY, filtered);

    this.recalcStoryState(task.storyId);
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
}
