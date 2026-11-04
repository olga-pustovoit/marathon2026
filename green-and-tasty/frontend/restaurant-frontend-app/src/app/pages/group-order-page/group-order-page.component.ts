import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Subscription,
  catchError,
  exhaustMap,
  finalize,
  forkJoin,
  interval,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';

import { Participant } from '@app/models/group-orders/participant.model';
import { GroupReservationStatus } from '@app/models/group-orders/group-status.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { ParticipantCardComponent } from '@app/components/group-orders/participant-card/participant-card.component';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { ToastService } from '@app/services/toast/toast.service';
import { consolidatePreOrder } from '@app/shared/helpers/consolidate-pre-order';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';

const SYNC_INTERVAL_MS = 15_000;

@Component({
  selector: 'app-group-order-page',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, ParticipantCardComponent, ModalComponent],
  templateUrl: './group-order-page.component.html',
  styleUrl: './group-order-page.component.scss',
})
export class GroupOrderPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(GroupOrdersService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly reservationId = this.route.snapshot.paramMap.get('reservationId') ?? '';

  readonly invite = signal<GuestInvite | null>(null);
  readonly participants = signal<Participant[]>([]);
  readonly ownerSessionId = signal('');
  readonly status = signal<GroupReservationStatus>('Open');
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly submitting = signal(false);
  readonly showSubmitModal = signal(false);
  readonly selectedGuest = signal<Participant | null>(null);
  readonly removingGuest = signal(false);
  readonly refreshErrorMessage = signal('');
  readonly updatedAt = signal<Date | null>(null);
  private readonly refreshInFlight = signal(false);

  private syncSubscription: Subscription | null = null;

  readonly statusLabel = computed(() =>
    this.status() === 'Submitted' ? 'Sent to Restaurant' : 'Collecting pre-orders'
  );
  readonly guestCount = computed(
    () => `${this.participants().length} of ${this.invite()?.MaxGuestCount ?? 0} guests`
  );
  readonly pendingCount = computed(
    () => this.participants().filter((participant) => !participant.isSubmitted).length
  );
  readonly consolidatedOrder = computed(() => consolidatePreOrder(this.participants()));
  readonly grandTotal = computed(() => this.consolidatedOrder().total);
  readonly hasSubmittedDishes = computed(() => this.consolidatedOrder().items.length > 0);
  readonly updatedAtLabel = computed(() => {
    const date = this.updatedAt();
    return date
      ? date.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        })
      : '';
  });

  constructor() {
    this.load();
    this.destroyRef.onDestroy(() => this.stopSync());
  }

  load(): void {
    this.stopSync();
    this.loading.set(true);
    this.errorMessage.set('');
    this.refreshErrorMessage.set('');

    this.service
      .getGroupInvite$(this.reservationId)
      .pipe(
        switchMap((invite) =>
          forkJoin({
            invite: of(invite),
            sessions: this.service.getSessions$(invite.GroupReservationId),
            ownerSessionId: this.service.getOwnerSessionId$(this.reservationId),
            status: this.service.getStatus$(invite.GroupReservationId),
          })
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ invite, sessions, ownerSessionId, status }) => {
          this.invite.set(invite);
          this.participants.set(sessions.participants);
          this.ownerSessionId.set(ownerSessionId);
          this.status.set(status.status);
          this.updatedAt.set(new Date());
          this.loading.set(false);
          this.startSync();
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.errorMessage.set(
            error.status === 404
              ? 'Group reservation not found'
              : 'Unable to load group reservation'
          );
        },
      });
  }

  refresh(): void {
    if (this.refreshInFlight() || this.status() !== 'Open') {
      return;
    }

    this.refreshData$().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  isOwner(participant: Participant): boolean {
    return participant.id === this.ownerSessionId();
  }

  canRemove(participant: Participant): boolean {
    return (
      this.status() === 'Open' &&
      participant.type === 'Guest' &&
      participant.id !== this.ownerSessionId()
    );
  }

  openSubmitModal(): void {
    this.showSubmitModal.set(true);
  }

  closeSubmitModal(): void {
    if (!this.submitting()) {
      this.showSubmitModal.set(false);
    }
  }

  confirmSubmit(): void {
    const invite = this.invite();
    if (!invite || this.submitting() || !this.hasSubmittedDishes() || this.status() !== 'Open') {
      return;
    }

    this.submitting.set(true);
    this.service
      .submit$(invite.GroupReservationId, this.reservationId)
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.status.set('Submitted');
          this.showSubmitModal.set(false);
          this.stopSync();
          this.toast.success('Pre-order sent to the restaurant');
        },
        error: () => {
          // tokenInterceptor displays the API error toast; keep the confirmation open for retry.
        },
      });
  }

  requestRemove(participant: Participant): void {
    if (this.canRemove(participant) && !this.removingGuest()) {
      this.selectedGuest.set(participant);
    }
  }

  closeRemoveModal(): void {
    if (!this.removingGuest()) {
      this.selectedGuest.set(null);
    }
  }

  confirmRemove(): void {
    const invite = this.invite();
    const guest = this.selectedGuest();
    if (!invite || !guest || !this.canRemove(guest) || this.removingGuest()) {
      return;
    }

    this.removingGuest.set(true);
    this.service
      .removeSession$(invite.GroupReservationId, guest.id)
      .pipe(
        finalize(() => this.removingGuest.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          this.participants.set(response.participants);
          this.updatedAt.set(new Date());
          this.refreshErrorMessage.set('');
          this.selectedGuest.set(null);
        },
        error: () => {
          // tokenInterceptor displays the API error toast; keep the guest in the list for retry.
        },
      });
  }

  private startSync(): void {
    if (this.status() !== 'Open' || this.syncSubscription) {
      return;
    }

    this.syncSubscription = interval(SYNC_INTERVAL_MS)
      .pipe(
        exhaustMap(() => this.refreshData$()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  private stopSync(): void {
    this.syncSubscription?.unsubscribe();
    this.syncSubscription = null;
  }

  private refreshData$() {
    const invite = this.invite();
    if (!invite || this.status() !== 'Open' || this.refreshInFlight()) {
      return EMPTY;
    }

    this.refreshInFlight.set(true);
    return forkJoin({
      sessions: this.service.getSessions$(invite.GroupReservationId, { silent: true }),
      status: this.service.getStatus$(invite.GroupReservationId, { silent: true }),
    }).pipe(
      tap(({ sessions, status }) => {
        this.participants.set(sessions.participants);
        this.status.set(status.status);
        this.updatedAt.set(new Date());
        this.refreshErrorMessage.set('');
        if (status.status !== 'Open') {
          this.stopSync();
        }
      }),
      map(() => undefined),
      catchError(() => {
        this.refreshErrorMessage.set(
          `Couldn't refresh. Showing data from ${this.updatedAtLabel()}`
        );
        return of(undefined);
      }),
      finalize(() => this.refreshInFlight.set(false))
    );
  }
}
