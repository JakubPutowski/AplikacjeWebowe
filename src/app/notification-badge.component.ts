import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-notification-badge',
  standalone: true,
  imports: [MatBadgeModule, MatButtonModule, MatIconModule],
  template: `
    <button
      mat-icon-button
      [matBadge]="count"
      [matBadgeHidden]="count === 0"
      matBadgeColor="warn"
      [matBadgeSize]="'small'"
      aria-label="Powiadomienia"
      (click)="openList.emit()"
    >
      <mat-icon>notifications</mat-icon>
    </button>
  `,
})
export class NotificationBadgeComponent {
  @Input() count = 0;
  @Output() openList = new EventEmitter<void>();
}
