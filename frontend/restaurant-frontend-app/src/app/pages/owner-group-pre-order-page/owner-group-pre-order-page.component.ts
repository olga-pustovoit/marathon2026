import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, switchMap } from 'rxjs';

import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { Participant } from '@app/models/group-orders/participant.model';
import { GroupStatusResponse } from '@app/models/group-orders/group-status.model';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';

@Component({
  selector: 'app-owner-group-pre-order-page',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './owner-group-pre-order-page.component.html',
  styleUrl: './owner-group-pre-order-page.component.scss',
})
export class OwnerGroupPreOrderPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly groupOrdersService = inject(GroupOrdersService);

  readonly reservationId = this.route.snapshot.paramMap.get('reservationId') ?? '';

  readonly invite = signal<GuestInvite | null>(null);
  readonly participants = signal<Participant[]>([]);
  readonly status = signal<GroupStatusResponse | null>(null);
  readonly ownerSessionId = signal('');
  readonly inviteUrl = signal('');
  readonly deletingGuestId = signal('');
  readonly deleteError = signal('');

  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly submitError = signal('');
  readonly successMessage = signal('');

  readonly guestParticipants = computed(() =>
    this.participants().filter((participant) => participant.id !== this.ownerSessionId())
  );

  readonly submittedParticipants = computed(() =>
    this.participants().filter((participant) => participant.isSubmitted)
  );

  readonly pendingParticipants = computed(() =>
    this.participants().filter((participant) => !participant.isSubmitted)
  );

  readonly consolidatedItems = computed(() => {
    const dishes = new Map<
      string,
      { dish: Participant['items'][number]['dish']; quantity: number }
    >();

    for (const participant of this.submittedParticipants()) {
      for (const item of participant.items) {
        const existing = dishes.get(item.dish.id);

        dishes.set(item.dish.id, {
          dish: item.dish,
          quantity: (existing?.quantity ?? 0) + item.quantity,
        });
      }
    }

    return [...dishes.values()];
  });

  readonly consolidatedTotal = computed(() =>
    this.consolidatedItems().reduce((total, item) => total + item.dish.price * item.quantity, 0)
  );

  readonly ownerParticipant = computed(
    () =>
      this.participants().find((participant) => participant.id === this.ownerSessionId()) ?? null
  );

  constructor() {
    if (!this.reservationId) {
      this.loading.set(false);
      this.error.set('Reservation ID is missing.');
      return;
    }

    this.loadInitialData();
  }

  refresh(): void {
    const invite = this.invite();

    if (!invite || this.refreshing()) {
      return;
    }

    this.refreshing.set(true);
    this.successMessage.set('');
    this.loadGroupData(invite.GroupReservationId, true);
  }

  deleteGuest(participant: Participant): void {
    const invite = this.invite();

    if (
      !invite ||
      participant.type === 'Owner' ||
      participant.id === this.ownerSessionId() ||
      this.deletingGuestId()
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Remove ${participant.name} and their dishes from the group order?`
    );

    if (!confirmed) {
      return;
    }

    this.deletingGuestId.set(participant.id);
    this.deleteError.set('');
    this.successMessage.set('');

    this.groupOrdersService
      .deleteGuestSession$(invite.GroupReservationId, participant.id)
      .subscribe({
        next: (response) => {
          this.participants.set(response.participants);
          this.deletingGuestId.set('');
          this.successMessage.set(`${participant.name} was removed from the group order.`);
        },
        error: () => {
          this.deletingGuestId.set('');
          this.deleteError.set(`Could not remove ${participant.name}. Please try again.`);
        },
      });
  }

  submitGroupPreOrder(): void {
    const invite = this.invite();

    if (
      !invite ||
      this.status()?.status !== 'Open' ||
      this.submitting() ||
      this.submittedParticipants().length === 0
    ) {
      return;
    }

    this.submitting.set(true);
    this.submitError.set('');
    this.successMessage.set('');

    this.groupOrdersService.submit$(invite.GroupReservationId, this.reservationId).subscribe({
      next: () => {
        this.submitting.set(false);
        this.successMessage.set('Group pre-order submitted successfully.');
        this.loadGroupData(invite.GroupReservationId, false);
      },
      error: () => {
        this.submitting.set(false);
        this.submitError.set('Could not submit the group pre-order. Please try again.');
      },
    });
  }

  copyInviteLink(): void {
    const url = this.inviteUrl();

    if (!url || !navigator.clipboard) {
      this.error.set('Clipboard is not available in this browser.');
      return;
    }

    navigator.clipboard.writeText(url).then(
      () => this.successMessage.set('Invitation link copied.'),
      () => this.error.set('Could not copy the invitation link.')
    );
  }

  private loadInitialData(): void {
    this.loading.set(true);
    this.error.set('');

    forkJoin({
      token: this.groupOrdersService.getInviteToken$(this.reservationId),
      owner: this.groupOrdersService.getOwnerSessionId$(this.reservationId),
    })
      .pipe(
        switchMap(({ token, owner }) =>
          forkJoin({
            invite: this.groupOrdersService.getGroupInvite$(this.reservationId),
            ownerSessionId: [owner.guestSessionId],
            inviteToken: [token.token],
          })
        )
      )
      .subscribe({
        next: ({ invite, ownerSessionId, inviteToken }) => {
          this.invite.set(invite);
          this.ownerSessionId.set(ownerSessionId);
          this.inviteUrl.set(`${window.location.origin}/join/${encodeURIComponent(inviteToken)}`);
          this.loadGroupData(invite.GroupReservationId, false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(
            'Could not load reservation information. Please check your access and try again.'
          );
        },
      });
  }

  private loadGroupData(groupReservationId: string, isRefresh: boolean): void {
    forkJoin({
      sessions: this.groupOrdersService.getSessions$(groupReservationId, {
        silent: true,
      }),
      status: this.groupOrdersService.getStatus$(groupReservationId, {
        silent: true,
      }),
    }).subscribe({
      next: ({ sessions, status }) => {
        this.participants.set(sessions.participants);
        this.status.set(status);
        this.loading.set(false);
        this.refreshing.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.refreshing.set(false);

        if (!isRefresh) {
          this.error.set('Could not load group participants. Please try again.');
        }
      },
    });
  }
}
