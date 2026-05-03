import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { useAppStorage } from './app-storage';
import { Notification, NotificationPriority, UserID } from './notification.model';

type CreateNotificationInput = {
  title: string;
  message: string;
  priority: NotificationPriority;
  recipientId: UserID;
};

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly STORAGE_KEY = 'notifications_data';
  private storage = useAppStorage();
  private notifications: Notification[] = [];
  private initialized = false;
  private initializingPromise: Promise<void> | null = null;

  private createdSubject = new Subject<Notification>();
  private changedSubject = new Subject<void>();

  readonly created$ = this.createdSubject.asObservable();
  readonly changed$ = this.changedSubject.asObservable();

  initialize(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    if (this.initializingPromise) return this.initializingPromise;

    this.initializingPromise = this.loadNotifications().finally(() => {
      this.initializingPromise = null;
    });

    return this.initializingPromise;
  }

  getNotificationsForRecipient(recipientId: UserID): Notification[] {
    return this.getAll()
      .filter((item) => item.recipientId === recipientId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  getNotificationForRecipient(id: string, recipientId: UserID): Notification | null {
    return this.getAll().find((item) => item.id === id && item.recipientId === recipientId) ?? null;
  }

  getUnreadCountForRecipient(recipientId: UserID): number {
    return this.getAll().filter((item) => item.recipientId === recipientId && !item.isRead).length;
  }

  markAsReadForRecipient(id: string, recipientId: UserID): void {
    const all = this.getAll();
    const idx = all.findIndex((item) => item.id === id && item.recipientId === recipientId);
    if (idx === -1 || all[idx].isRead) return;

    all[idx] = { ...all[idx], isRead: true };
    this.saveAll(all);
  }

  markAllAsReadForRecipient(recipientId: UserID): void {
    const all = this.getAll();
    let changed = false;

    const next = all.map((item) => {
      if (item.recipientId !== recipientId || item.isRead) return item;
      changed = true;
      return { ...item, isRead: true };
    });

    if (!changed) return;
    this.saveAll(next);
  }

  sendToUser(input: CreateNotificationInput): Notification {
    const nextItem: Notification = {
      id: crypto.randomUUID(),
      title: input.title,
      message: input.message,
      date: new Date().toISOString(),
      priority: input.priority,
      isRead: false,
      recipientId: input.recipientId,
    };

    const next = [nextItem, ...this.getAll()];
    this.saveAll(next);
    this.createdSubject.next(nextItem);

    return nextItem;
  }

  sendToUsers(recipientIds: UserID[], input: Omit<CreateNotificationInput, 'recipientId'>): Notification[] {
    const uniqueRecipientIds = Array.from(new Set(recipientIds));
    if (uniqueRecipientIds.length === 0) return [];

    const created: Notification[] = uniqueRecipientIds.map((recipientId) => ({
      id: crypto.randomUUID(),
      title: input.title,
      message: input.message,
      date: new Date().toISOString(),
      priority: input.priority,
      isRead: false,
      recipientId,
    }));

    const next = [...created, ...this.getAll()];
    this.saveAll(next);

    for (const item of created) {
      this.createdSubject.next(item);
    }

    return created;
  }

  private getAll(): Notification[] {
    return this.notifications;
  }

  private saveAll(value: Notification[]): void {
    this.notifications = value;
    void this.storage.set(this.STORAGE_KEY, value);
    this.changedSubject.next();
  }

  private async loadNotifications(): Promise<void> {
    const raw = await this.storage.get<unknown[]>(this.STORAGE_KEY, []);
    const parsed = Array.isArray(raw) ? raw : [];

    this.notifications = parsed.filter(
      (item): item is Notification =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as Notification).id === 'string' &&
        typeof (item as Notification).title === 'string' &&
        typeof (item as Notification).message === 'string' &&
        typeof (item as Notification).date === 'string' &&
        ((item as Notification).priority === 'low' ||
          (item as Notification).priority === 'medium' ||
          (item as Notification).priority === 'high') &&
        typeof (item as Notification).isRead === 'boolean' &&
        typeof (item as Notification).recipientId === 'string',
    );

    this.initialized = true;
  }
}
