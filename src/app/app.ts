import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatOptionModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { Subscription } from 'rxjs';
import { LOCAL_ADMIN_EMAIL, SUPER_ADMIN_EMAIL } from './auth.config';
import { GithubAuthService, type OAuthProfile } from './github-auth.service';
import { NotificationBadgeComponent } from './notification-badge.component';
import { NotificationDialogComponent } from './notification-dialog.component';
import { Notification } from './notification.model';
import { NotificationService } from './notification.service';
import { ProjectModel, Story, StoryPriority, StoryState, User, UserRole } from './project.model';
import { ProjectService } from './project';
import { Task, TaskPriority, TaskState } from './task.model';
import { ThemeMode, ThemeService } from './theme.service';

type ActiveView = 'board' | 'notifications' | 'notification-detail' | 'users';
type AuthState = 'logged-out' | 'blocked' | 'guest-pending' | 'active';

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
  private githubAuthService = inject(GithubAuthService);
  private dialog = inject(MatDialog);

  private notificationCreatedSub?: Subscription;
  private notificationChangedSub?: Subscription;

  currentUser = signal<User | null>(null);
  users = signal<User[]>([]);
  themeMode = signal<ThemeMode>('system');
  authState = signal<AuthState>('logged-out');

  activeView = signal<ActiveView>('board');
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

  localAdminLogin = '';
  localAdminPassword = '';
  localAuthError = signal<string | null>(null);
  oauthAuthError = signal<string | null>(null);

  ngOnInit() {
    this.themeMode.set(this.themeService.init());
    this.refreshList();
    this.refreshUsers();
    this.hydrateSession();

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
  }

  ngOnDestroy(): void {
    this.notificationCreatedSub?.unsubscribe();
    this.notificationChangedSub?.unsubscribe();
  }

  async signInWithGithub() {
    this.oauthAuthError.set(null);
    this.localAuthError.set(null);
    if (!this.isGithubAuthConfigured()) {
      this.oauthAuthError.set(
        'Logowanie GitHub nie jest skonfigurowane. Uzupełnij FIREBASE_CONFIG w auth.config.ts.',
      );
      return;
    }

    try {
      const oauthProfile = await this.githubAuthService.signInWithGithub();
      if (!oauthProfile) {
        this.oauthAuthError.set('Konto GitHub nie zwróciło adresu e-mail.');
        return;
      }
      this.completeOAuthLogin(oauthProfile);
    } catch (error) {
      console.error('GitHub sign-in failed', error);
      this.oauthAuthError.set(
        'Nie udało się zalogować przez GitHub. Sprawdź konfigurację Firebase Auth i GitHub OAuth App.',
      );
    }
  }

  signInAsLocalAdmin() {
    this.localAuthError.set(null);

    const loginResult = this.projectService.loginWithLocalAdmin({
      login: this.localAdminLogin,
      password: this.localAdminPassword,
    });

    if (!loginResult) {
      this.localAuthError.set('Nieprawidłowy login lub hasło administratora.');
      return;
    }

    this.localAdminPassword = '';
    this.refreshUsers();
    this.currentUser.set(loginResult.user);
    this.reconcileCurrentUserState();

    if (this.hasAppAccess()) {
      this.refreshList();
      this.refreshProjectContext();
      this.refreshNotifications();
    }
  }

  async signOut() {
    this.projectService.clearCurrentUser();

    try {
      await this.githubAuthService.signOut();
    } catch {
      // Brak aktywnej sesji OAuth też jest poprawnym scenariuszem.
    }

    this.currentUser.set(null);
    this.authState.set('logged-out');
    this.activeView.set('board');
    this.resetProjectContext();
    this.refreshNotifications();
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
    const current = this.currentUser();
    if (!current) {
      this.notifications.set([]);
      this.unreadNotificationsCount.set(0);
      this.selectedNotificationId.set(null);
      return;
    }

    const currentRecipientId = current.id;
    this.notifications.set(
      this.notificationService.getNotificationsForRecipient(currentRecipientId),
    );
    this.unreadNotificationsCount.set(
      this.notificationService.getUnreadCountForRecipient(currentRecipientId),
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

  isAdmin(): boolean {
    const user = this.currentUser();
    return user?.role === 'admin';
  }

  canManageTasks(): boolean {
    const user = this.currentUser();
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'guest') return false;
    return this.authState() === 'active';
  }

  canManageUsers(): boolean {
    return this.authState() === 'active' && this.isAdmin();
  }

  hasAppAccess(): boolean {
    return this.authState() === 'active';
  }

  isGuestPending(): boolean {
    return this.authState() === 'guest-pending';
  }

  isBlocked(): boolean {
    return this.authState() === 'blocked';
  }

  isLoggedOut(): boolean {
    return this.authState() === 'logged-out';
  }

  setThemeMode(mode: ThemeMode) {
    this.themeService.setMode(mode);
    this.themeMode.set(mode);
  }

  addProject() {
    if (!this.hasAppAccess()) return;
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
    if (!this.hasAppAccess()) return;
    this.projectService.deleteProject(id);
    this.refreshList();
    this.resetProjectContext();
  }

  selectProject(id: string) {
    if (!this.hasAppAccess()) return;
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

  addStory() {
    const pId = this.currentProjectId();
    const user = this.currentUser();
    if (!this.hasAppAccess() || !user) return;

    if (this.storyName.trim() && pId) {
      this.projectService.addStory({
        name: this.storyName,
        description: this.storyDesc,
        priority: this.storyPriority,
        projectId: pId,
        state: 'todo',
        ownerId: user.id,
      });

      this.storyName = '';
      this.storyDesc = '';
      this.storyPriority = 'średni';
      this.refreshStories();
    }
  }

  removeStory(storyId: string) {
    if (!this.hasAppAccess()) return;
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
    if (!this.hasAppAccess()) return;
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
    const user = this.currentUser();
    if (!user) return;

    this.projectService.startTask(taskId, user.id);
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
    return `${value} h`;
  }

  clearSelectedTask() {
    this.selectedTaskId.set(null);
  }

  goToBoard() {
    if (!this.hasAppAccess()) return;
    this.activeView.set('board');
  }

  goToNotifications() {
    if (!this.hasAppAccess()) return;
    this.refreshNotifications();
    this.activeView.set('notifications');
  }

  goToUsers() {
    if (!this.canManageUsers()) return;
    this.refreshUsers();
    this.activeView.set('users');
  }

  openNotificationDetail(notificationId: string) {
    if (!this.hasAppAccess()) return;
    const current = this.currentUser();
    if (!current) return;

    this.notificationService.markAsReadForRecipient(notificationId, current.id);
    this.selectedNotificationId.set(notificationId);
    this.refreshNotifications();
    this.activeView.set('notification-detail');
  }

  markNotificationAsRead(notificationId: string) {
    const current = this.currentUser();
    if (!current) return;

    this.notificationService.markAsReadForRecipient(notificationId, current.id);
    this.refreshNotifications();
  }

  markAllNotificationsAsRead() {
    const current = this.currentUser();
    if (!current) return;

    this.notificationService.markAllAsReadForRecipient(current.id);
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

  getRoleLabel(role: UserRole): string {
    if (role === 'admin') return 'Admin';
    if (role === 'devops') return 'DevOps';
    if (role === 'developer') return 'Developer';
    return 'Gość';
  }

  changeUserRole(userId: string, role: UserRole) {
    if (!this.canManageUsers()) return;

    const user = this.users().find((item) => item.id === userId);
    if (!user || this.isSuperAdminUser(user)) return;

    this.projectService.updateUserRole(userId, role);
    this.refreshUsers();
    this.reconcileCurrentUserState();
  }

  toggleUserBlocked(userId: string) {
    if (!this.canManageUsers()) return;

    const user = this.users().find((item) => item.id === userId);
    if (!user || this.isSuperAdminUser(user)) return;

    this.projectService.setUserBlocked(userId, !user.isBlocked);
    this.refreshUsers();
    this.reconcileCurrentUserState();
  }

  isSuperAdminUser(user: User): boolean {
    const normalizedEmail = user.email.trim().toLowerCase();
    return (
      normalizedEmail === SUPER_ADMIN_EMAIL.trim().toLowerCase() ||
      normalizedEmail === LOCAL_ADMIN_EMAIL.trim().toLowerCase()
    );
  }

  isGithubAuthConfigured(): boolean {
    return this.githubAuthService.isConfigured();
  }

  private shouldOpenNotificationDialog(notification: Notification): boolean {
    const current = this.currentUser();
    if (!current) return false;

    const isCurrentUserRecipient = notification.recipientId === current.id;
    const hasDialogPriority =
      notification.priority === 'medium' || notification.priority === 'high';
    return isCurrentUserRecipient && hasDialogPriority;
  }

  private completeOAuthLogin(profile: OAuthProfile) {
    if (!profile.email) return;

    const loginResult = this.projectService.loginWithOAuth({
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      fullName: profile.fullName,
    });

    this.refreshUsers();
    this.currentUser.set(loginResult.user);
    this.reconcileCurrentUserState();

    if (this.hasAppAccess()) {
      this.refreshList();
      this.refreshProjectContext();
      this.refreshNotifications();
    }
  }

  private hydrateSession() {
    const current = this.projectService.getCurrentUser();
    this.currentUser.set(current);
    this.reconcileCurrentUserState();

    if (this.hasAppAccess()) {
      this.refreshProjectContext();
      this.refreshNotifications();
    } else {
      this.resetProjectContext();
      this.refreshNotifications();
    }
  }

  private reconcileCurrentUserState() {
    const storedCurrent = this.projectService.getCurrentUser();
    this.currentUser.set(storedCurrent);

    if (!storedCurrent) {
      this.authState.set('logged-out');
      this.activeView.set('board');
      this.resetProjectContext();
      return;
    }

    if (storedCurrent.isBlocked) {
      this.authState.set('blocked');
      this.activeView.set('board');
      this.resetProjectContext();
      return;
    }

    if (storedCurrent.role === 'guest') {
      this.authState.set('guest-pending');
      this.activeView.set('board');
      this.resetProjectContext();
      return;
    }

    this.authState.set('active');
    if (this.activeView() === 'users' && !this.isAdmin()) {
      this.activeView.set('board');
    }
  }

  private refreshProjectContext() {
    const savedProjectId = this.projectService.getCurrentProjectId();
    if (!savedProjectId) {
      this.resetProjectContext();
      return;
    }

    this.currentProjectId.set(savedProjectId);
    this.refreshStories();
    this.refreshTasks();
  }

  private resetProjectContext() {
    this.currentProjectId.set(null);
    this.currentStoryId.set(null);
    this.selectedTaskId.set(null);
    this.stories.set([]);
    this.tasks.set([]);
    this.selectedNotificationId.set(null);
  }
}
