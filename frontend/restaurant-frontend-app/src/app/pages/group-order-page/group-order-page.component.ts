import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, Subscription, forkJoin, of } from 'rxjs';
import { catchError, exhaustMap, map, takeUntil } from 'rxjs/operators';

import { Participant, ParticipantItem } from '@app/models/group-orders/participant.model';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GroupStatusResponse } from '@app/models/group-orders/group-status.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';

import { ParticipantCardComponent } from '@app/components/group-orders/participant-card/participant-card.component';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { ToastService } from '@app/services/toast/toast.service';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';

interface ConsolidatedDish {
  dish: ParticipantItem['dish'];
  quantity: number;
}

@Component({
  selector: 'app-group-order-page',
  standalone: true,
  imports: [CurrencyPipe, ParticipantCardComponent, ModalComponent],
  templateUrl: './group-order-page.component.html',
  styleUrl: './group-order-page.component.scss',
})
export class GroupOrderPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(GroupOrdersService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly refresh$ = new Subject<void>();
  private readonly stopSync$ = new Subject<void>();
  private syncSubscription: Subscription | null = null;
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;

  readonly reservationId =
    this.route.snapshot.paramMap.get('reservationId') ?? '';

  invite: GuestInvite | null = null;
  participants: Participant[] = [];
  ownerSessionId = '';
  status: GroupStatusResponse['status'] = 'Open';

  loading = true;
  errorMessage = '';
  showSubmitModal = false;
  submitting = false;
  submitted = false;
  refreshErrorMessage = '';
  updatedAt: Date | null = null;

  get updatedAtLabel(): string {
    if (!this.updatedAt) return '';

    return this.updatedAt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  get pendingCount(): number {
    return this.participants.filter((p) => !p.isSubmitted).length;
  }

  get consolidatedDishes(): ConsolidatedDish[] {
    const dishes = new Map<string, ConsolidatedDish>();

    for (const participant of this.participants) {
      if (!participant.isSubmitted) {
        continue;
      }

      for (const item of participant.items) {
        const existing = dishes.get(item.dish.id);

        if (existing) {
          existing.quantity += item.quantity;
        } else {
          dishes.set(item.dish.id, {
            dish: item.dish,
            quantity: item.quantity,
          });
        }
      }
    }

    return Array.from(dishes.values());
  }

  get grandTotal(): number {
    return this.consolidatedDishes.reduce(
      (total, item) => total + item.dish.price * item.quantity,
      0
    );
  }

  get hasSubmittedDishes(): boolean {
    return this.consolidatedDishes.length > 0;
  }

  get guestCount(): string {
    return `${this.participants.length} of ${this.statusMaxCapacity} guests`;
  }

  get statusMaxCapacity(): number {
    return this.invite?.MaxGuestCount ?? 0;
  }

  get statusLabel(): string {
    return this.submitted || this.status === 'Submitted'
      ? 'Sent to Restaurant'
      : 'Collecting pre-orders';
  }

  get reservationDate(): string {
    if (!this.invite?.StartTime) {
      return '';
    }

    return new Date(this.invite.StartTime).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  constructor() {
    this.load();

    this.destroyRef.onDestroy(() => {
      this.stopSync();
      this.stopSync$.complete();
      this.refresh$.complete();
    });
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';

    this.service.getGroupInvite$(this.reservationId).subscribe({
      next: (invite) => {
        this.invite = invite;

        forkJoin({
          sessions: this.service.getSessions$(invite.GroupReservationId),
          ownerId: this.service.getOwnerSessionId$(this.reservationId),
          status: this.service.getStatus$(invite.GroupReservationId),
        }).subscribe({
          next: ({ sessions, ownerId, status }) => {
          this.participants = sessions.participants;
            this.ownerSessionId = ownerId;
            this.status = status.status;
            this.updatedAt = new Date();
            this.loading = false;

            this.startSync();
          },
          error: () => {
            this.loading = false;
            this.errorMessage = 'Unable to load group reservation';
          },
        });
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        this.errorMessage =
          error.status === 404
            ? 'Group reservation not found'
            : 'Unable to load group reservation';
      },
    });
  }

  private startSync(): void {
    this.syncSubscription?.unsubscribe();

    if (this.syncIntervalId !== null) {
      clearInterval(this.syncIntervalId);
    }

    this.syncSubscription = this.refresh$
      .pipe(
        takeUntil(this.stopSync$),
        exhaustMap(() => this.refreshSessions$())
      )
      .subscribe();

    this.syncIntervalId = setInterval(() => {
      this.refresh$.next();
    }, 15_000);
  }

  private stopSync(): void {
    this.stopSync$.next();
    this.syncSubscription?.unsubscribe();
    this.syncSubscription = null;

    if (this.syncIntervalId !== null) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  private refreshSessions$() {
    if (!this.invite || this.status !== 'Open' || this.submitted) {
      return of(null);
    }

    return this.service
      .getSessions$(this.invite.GroupReservationId, { silent: true })
      .pipe(
        map((sessions) => {
          this.participants = sessions.participants;
          this.refreshErrorMessage = '';
          this.updatedAt = new Date();
          this.cdr.detectChanges();

          return sessions;
        }),
        catchError((error) => {
          this.refreshErrorMessage =
            `Couldn't refresh. Showing data from ${this.updatedAtLabel}`;
          this.cdr.detectChanges();

          return of(null);
        })
      );
  }

  refresh(): void {
    this.refresh$.next();
  }

  isOwner(participant: Participant): boolean {
    return participant.id === this.ownerSessionId;
  }

  openSubmitModal(): void {
    this.showSubmitModal = true;
  }

  closeSubmitModal(): void {
    if (!this.submitting) {
      this.showSubmitModal = false;
    }
  }

  confirmSubmit(): void {
    if (
      this.submitting ||
      !this.invite ||
      !this.hasSubmittedDishes ||
      this.submitted
    ) {
      return;
    }

    this.submitting = true;

    this.service
      .submit$(this.invite.GroupReservationId, this.reservationId)
      .subscribe({
        next: () => {
          this.submitting = false;
          this.submitted = true;
          this.status = 'Submitted';
          this.showSubmitModal = false;
          this.stopSync();
          this.toast.success('Pre-order sent to the restaurant');
        },
        error: () => {
          this.submitting = false;
          this.toast.error('Unable to submit pre-order');
        },
      });
  }
}
