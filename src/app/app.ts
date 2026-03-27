import { Component, signal, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectService } from './project';
import { ProjectModel } from './project.model';
import { Story, StoryPriority, StoryState, User } from './project.model';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { CommonModule } from '@angular/common';
import { Task, TaskPriority, TaskState } from './task.model';
import { ThemeMode, ThemeService } from './theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSelectModule,
    MatOptionModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private projectService = inject(ProjectService);
  private themeService = inject(ThemeService);

  currentUser = this.projectService.getCurrentUser();
  users = signal<User[]>([]);
  themeMode = signal<ThemeMode>('system');

  currentProjectId = signal<string | null>(null);

  projects = signal<ProjectModel[]>([]);

  stories = signal<Story[]>([]);

  currentStoryId = signal<string | null>(null);
  tasks = signal<Task[]>([]);
  selectedTaskId = signal<string | null>(null);

  projectName = '';
  projectDesc = '';

  storyName = '';
  storyDesc = '';
  storyPriority: StoryPriority = 'średni';

  taskName = '';
  taskDesc = '';
  taskPriority: TaskPriority = 'średni';
  taskExpectedHours = 1;

  ngOnInit() {
    this.themeMode.set(this.themeService.init());
    this.refreshList();
    this.refreshUsers();

    const savedProjectId = this.projectService.getCurrentProjectId();

    if (savedProjectId) {
      this.currentProjectId.set(savedProjectId);
      this.refreshStories();
    }
  }

  refreshList() {
    this.projects.set(this.projectService.getProjects());
  }

  refreshUsers() {
    this.users.set(this.projectService.getUsers());
  }

  refreshStories() {
    const pId = this.currentProjectId();
    if (pId) {
      this.stories.set(this.projectService.getStoriesForProject(pId));
    } else {
      this.stories.set([]);
    }
  }

  refreshTasks() {
    const sId = this.currentStoryId();
    if (sId) {
      this.tasks.set(this.projectService.getTasksForStory(sId));
    } else {
      this.tasks.set([]);
    }
  }

  addProject() {
    if (this.projectName.trim()) {
      this.projectService.saveProject({
        name: this.projectName,
        description: this.projectDesc,
      });

      this.projectName = '';
      this.projectDesc = '';

      this.refreshList();
    }
  }

  deleteProject(id: string) {
    this.projectService.deleteProject(id);
    this.refreshList();
    this.currentProjectId.set(null);
    this.currentStoryId.set(null);
    this.selectedTaskId.set(null);
    this.refreshStories();
    this.refreshTasks();
  }

  selectProject(id: string) {
    this.projectService.setCurrentProjectId(id);
    this.currentProjectId.set(id);
    this.currentStoryId.set(null);
    this.selectedTaskId.set(null);
    this.refreshStories();
    this.refreshTasks();
  }

  getActiveProjectName() {
    return this.projects().find((p) => p.id === this.currentProjectId())?.name;
  }

  isAdmin(): boolean {
    return this.currentUser.role === 'admin';
  }

  canManageTasks(): boolean {
    // Admin nie realizuje zadań (tylko administruje systemem).
    return this.currentUser.role !== 'admin';
  }

  setCurrentUser(id: string) {
    this.projectService.setCurrentUserId(id);
    this.currentUser = this.projectService.getCurrentUser();
    this.refreshUsers();
    this.refreshTasks();
  }

  setThemeMode(mode: ThemeMode) {
    this.themeService.setMode(mode);
    this.themeMode.set(mode);
  }

  addStory() {
    const pId = this.currentProjectId();

    if (this.storyName.trim() && pId) {
      this.projectService.addStory({
        name: this.storyName,
        description: this.storyDesc,
        priority: this.storyPriority,
        projectId: pId,
        state: 'todo',
        ownerId: this.currentUser.id,
      });

      this.storyName = '';
      this.storyDesc = '';
      this.storyPriority = 'średni';
      this.refreshStories();
    }
  }

  removeStory(storyId: string) {
    if (confirm('Czy na pewno chcesz usunąć tę historyjkę?')) {
      this.projectService.deleteStory(storyId);
      if (this.currentStoryId() === storyId) {
        this.currentStoryId.set(null);
        this.selectedTaskId.set(null);
      }
      this.refreshStories();
      this.refreshTasks();
    }
  }

  selectStory(storyId: string) {
    this.currentStoryId.set(storyId);
    this.selectedTaskId.set(null);
    this.refreshTasks();
  }

  getStoriesByState(state: StoryState) {
    return this.stories().filter((s) => s.state === state);
  }

  getActiveStoryName() {
    const sId = this.currentStoryId();
    return sId ? this.stories().find((s) => s.id === sId)?.name : undefined;
  }

  getTasksByState(state: TaskState) {
    return this.tasks().filter((t) => t.state === state);
  }

  addTask() {
    const sId = this.currentStoryId();
    if (!sId || !this.canManageTasks()) return;

    if (!this.taskName.trim()) return;
    if (!this.taskDesc.trim()) return;
    const expectedHours = Number(this.taskExpectedHours);
    if (!Number.isFinite(expectedHours) || expectedHours <= 0) return;

    this.projectService.addTask({
      name: this.taskName,
      description: this.taskDesc,
      priority: this.taskPriority,
      storyId: sId,
      expectedHours,
    });

    this.taskName = '';
    this.taskDesc = '';
    this.taskPriority = 'średni';
    this.taskExpectedHours = 1;

    this.refreshTasks();
    this.refreshStories();
  }

  removeTask(taskId: string) {
    if (!this.canManageTasks()) return;
    if (!confirm('Czy na pewno chcesz usunąć to zadanie?')) return;

    this.projectService.deleteTask(taskId);
    if (this.selectedTaskId() === taskId) this.selectedTaskId.set(null);
    this.refreshTasks();
    this.refreshStories();
  }

  startTask(taskId: string) {
    if (!this.canManageTasks()) return;
    this.projectService.startTask(taskId, this.currentUser.id);
    this.selectedTaskId.set(taskId);
    this.refreshTasks();
    this.refreshStories();
  }

  completeTask(taskId: string) {
    if (!this.canManageTasks()) return;
    this.projectService.completeTask(taskId);
    this.selectedTaskId.set(taskId);
    this.refreshTasks();
    this.refreshStories();
  }

  selectTask(taskId: string) {
    this.selectedTaskId.set(taskId);
  }

  getSelectedTask(): Task | null {
    const id = this.selectedTaskId();
    if (!id) return null;
    return this.tasks().find((t) => t.id === id) ?? null;
  }

  getUserName(userId: string | null): string {
    if (!userId) return '-';
    const u = this.users().find((x) => x.id === userId);
    return u ? `${u.firstName} ${u.lastName}` : userId;
  }

  formatDate(value: string | null): string {
    if (!value) return '-';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
  }

  formatHours(value: number | null): string {
    if (value === null || value === undefined) return '-';
    // Wymaganie: wypisywać w godzinach.
    return `${value} h`;
  }

  clearSelectedTask() {
    this.selectedTaskId.set(null);
  }
}
