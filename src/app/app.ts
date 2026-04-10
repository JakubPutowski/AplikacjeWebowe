import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ProjectService } from './project';
import { ProjectModel } from './project.model';
import { Story, StoryPriority, StoryState, User } from './project.model';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { CommonModule } from '@angular/common';
import { Task, TaskPriority, TaskState } from './task.model';
import { ThemeMode, ThemeService } from './theme.service';
import { Notification } from './notification.model';
import { NotificationService } from './notification.service';
import { NotificationBadgeComponent } from './notification-badge.component';
import { NotificationDialogComponent } from './notification-dialog.component';

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
    MatDialogModule,
    MatIconModule,
    MatSelectModule,
    MatOptionModule,
    NotificationBadgeComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  private projectService = inject(ProjectService);
  private themeService = inject(ThemeService);
  private notificationService = inject(NotificationService);
  private dialog = inject(MatDialog);

  private notificationCreatedSub?: Subscription;
  private notificationChangedSub?: Subscription;

  currentUser = this.projectService.getCurrentUser();
  users = signal<User[]>([]);
  themeMode = signal<ThemeMode>('system');

  activeView = signal<'board' | 'notifications' | 'notification-detail'>('board');
  notifications = signal<Notification[]>([]);
  selectedNotificationId = signal<string | null>(null);
  unreadNotificationsCount = signal(0);

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
    this.refreshNotifications();

    this.notificationCreatedSub = this.notificationService.created$.subscribe((notification) => {
      this.refreshNotifications();
      if (!this.shouldOpenNotificationDialog(notification)) return;

      this.dialog
        .open(NotificationDialogComponent, {
          width: '440px',
          data: { notification },
        })
        .afterClosed()
        .subscribe((result) => {
          if (result === 'open-notifications') {
            this.goToNotifications();
          }
        });
    });

    this.notificationChangedSub = this.notificationService.changed$.subscribe(() => {
      this.refreshNotifications();
    });

    const savedProjectId = this.projectService.getCurrentProjectId();

    if (savedProjectId) {
      this.currentProjectId.set(savedProjectId);
      this.refreshStories();
    }
  }

  ngOnDestroy(): void {
    this.notificationCreatedSub?.unsubscribe();
    this.notificationChangedSub?.unsubscribe();
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

  refreshNotifications() {
    const currentRecipientId = this.currentUser.id;
    this.notifications.set(this.notificationService.getNotificationsForRecipient(currentRecipientId));
    this.unreadNotificationsCount.set(
      this.notificationService.getUnreadCountForRecipient(currentRecipientId)
    );

    const selectedId = this.selectedNotificationId();
    if (!selectedId) return;

    const exists = this.notifications().some((item) => item.id === selectedId);
    if (exists) return;

    this.selectedNotificationId.set(null);
    if (this.activeView() === 'notification-detail') {
      this.activeView.set('notifications');
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
    this.refreshNotifications();
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

  goToBoard() {
    this.activeView.set('board');
  }

  goToNotifications() {
    this.refreshNotifications();
    this.activeView.set('notifications');
  }

  openNotificationDetail(notificationId: string) {
    this.notificationService.markAsReadForRecipient(notificationId, this.currentUser.id);
    this.selectedNotificationId.set(notificationId);
    this.refreshNotifications();
    this.activeView.set('notification-detail');
  }

  markNotificationAsRead(notificationId: string) {
    this.notificationService.markAsReadForRecipient(notificationId, this.currentUser.id);
    this.refreshNotifications();
  }

  markAllNotificationsAsRead() {
    this.notificationService.markAllAsReadForRecipient(this.currentUser.id);
    this.refreshNotifications();
  }

  getSelectedNotification(): Notification | null {
    const id = this.selectedNotificationId();
    if (!id) return null;
    return this.notifications().find((item) => item.id === id) ?? null;
  }

  getNotificationPriorityLabel(priority: Notification['priority']): string {
    if (priority === 'high') return 'Wysoki';
    if (priority === 'medium') return 'Średni';
    return 'Niski';
  }

  private shouldOpenNotificationDialog(notification: Notification): boolean {
    const isCurrentUserRecipient = notification.recipientId === this.currentUser.id;
    const hasDialogPriority = notification.priority === 'medium' || notification.priority === 'high';
    return isCurrentUserRecipient && hasDialogPriority;
  }
}
