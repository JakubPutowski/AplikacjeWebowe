import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Notification } from './notification.model';

type NotificationDialogData = {
  notification: Notification;
};

@Component({
  selector: 'app-notification-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.notification.title }}</h2>

    <mat-dialog-content>
      <p style="margin-top: 0">{{ data.notification.message }}</p>
      <p style="margin: 6px 0 0 0; opacity: 0.8">
        Priorytet: <strong>{{ data.notification.priority.toUpperCase() }}</strong>
      </p>
      <p style="margin: 6px 0 0 0; opacity: 0.8">{{ formatDate(data.notification.date) }}</p>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="close()">Zamknij</button>
      <button mat-flat-button color="primary" (click)="openNotifications()">Pokaż powiadomienia</button>
    </mat-dialog-actions>
  `,
})
export class NotificationDialogComponent {
  private dialogRef = inject(MatDialogRef<NotificationDialogComponent>);
  data = inject<NotificationDialogData>(MAT_DIALOG_DATA);

  close(): void {
    this.dialogRef.close('close');
  }

  openNotifications(): void {
    this.dialogRef.close('open-notifications');
  }

  formatDate(value: string): string {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
  }
}
