import { TestBed } from '@angular/core/testing';

import { ProjectService } from './project';
import { NotificationService } from './notification.service';
import {
  LOCAL_ADMIN_EMAIL,
  LOCAL_ADMIN_LOGIN,
  LOCAL_ADMIN_PASSWORD,
  SUPER_ADMIN_EMAIL,
} from './auth.config';

describe('ProjectService', () => {
  let service: ProjectService;
  let notificationService: NotificationService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ProjectService);
    notificationService = TestBed.inject(NotificationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('creates guest user on first regular OAuth login', () => {
    const result = service.loginWithOAuth({
      email: 'user@example.com',
      firstName: 'Jan',
      lastName: 'Kowalski',
    });

    expect(result.isNew).toBe(true);
    expect(result.user.role).toBe('guest');
    expect(result.user.isBlocked).toBe(false);
  });

  it('creates super admin account as admin role', () => {
    const result = service.loginWithOAuth({
      email: SUPER_ADMIN_EMAIL,
      firstName: 'Super',
      lastName: 'Admin',
    });

    expect(result.isNew).toBe(true);
    expect(result.user.role).toBe('admin');
    expect(result.user.isBlocked).toBe(false);
  });

  it('sends high priority notification to admins when new account is created', () => {
    const admin = service.loginWithOAuth({
      email: SUPER_ADMIN_EMAIL,
      firstName: 'Super',
      lastName: 'Admin',
    }).user;

    const createdUser = service.loginWithOAuth({
      email: 'new.user@example.com',
      firstName: 'Nowy',
      lastName: 'Uzytkownik',
    }).user;

    const adminNotifications = notificationService.getNotificationsForRecipient(admin.id);
    const newAccountNotification = adminNotifications.find(
      (item) => item.priority === 'high' && item.title === 'Tworzenie nowego konta w systemie',
    );

    expect(createdUser.role).toBe('guest');
    expect(newAccountNotification).toBeTruthy();
    expect(newAccountNotification?.message).toContain(createdUser.email);
  });

  it('does not allow blocking super admin account', () => {
    const superAdmin = service.loginWithOAuth({
      email: SUPER_ADMIN_EMAIL,
      firstName: 'Super',
      lastName: 'Admin',
    }).user;

    service.setUserBlocked(superAdmin.id, true);

    const refreshed = service.getUsers().find((item) => item.id === superAdmin.id);
    expect(refreshed).toBeTruthy();
    expect(refreshed?.isBlocked).toBe(false);
  });

  it('allows local admin login with valid credentials', () => {
    const result = service.loginWithLocalAdmin({
      login: LOCAL_ADMIN_LOGIN,
      password: LOCAL_ADMIN_PASSWORD,
    });

    expect(result).toBeTruthy();
    expect(result?.user.role).toBe('admin');
    expect(result?.user.isBlocked).toBe(false);
    expect(result?.user.email).toBe(LOCAL_ADMIN_EMAIL.toLowerCase());
  });

  it('rejects local admin login with invalid credentials', () => {
    const result = service.loginWithLocalAdmin({
      login: LOCAL_ADMIN_LOGIN,
      password: 'wrong-password',
    });

    expect(result).toBeNull();
  });

  it('does not allow blocking local admin account', () => {
    const localAdmin = service.loginWithLocalAdmin({
      login: LOCAL_ADMIN_LOGIN,
      password: LOCAL_ADMIN_PASSWORD,
    })?.user;

    expect(localAdmin).toBeTruthy();
    if (!localAdmin) return;

    service.setUserBlocked(localAdmin.id, true);

    const refreshed = service.getUsers().find((item) => item.id === localAdmin.id);
    expect(refreshed).toBeTruthy();
    expect(refreshed?.isBlocked).toBe(false);
    expect(refreshed?.role).toBe('admin');
  });
});
