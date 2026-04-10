import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
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

  private createdSubject = new Subject<Notification>();
  private changedSubject = new Subject<void>();

  readonly created$ = this.createdSubject.asObservable();
  readonly changed$ = this.changedSubject.asObservable();

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
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as Notification[];
      if (!Array.isArray(parsed)) return [];

      return parsed.filter(
        (item) =>
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.message === 'string' &&
          typeof item.date === 'string' &&
          (item.priority === 'low' || item.priority === 'medium' || item.priority === 'high') &&
          typeof item.isRead === 'boolean' &&
          typeof item.recipientId === 'string'
      );
    } catch {
      return [];
    }
  }

  private saveAll(value: Notification[]): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(value));
    this.changedSubject.next();
  }
}
