import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, switchMap, map } from 'rxjs';
import { Participant } from '@app/models/group-orders/participant.model';
import { SKIP_ERROR_TOAST } from '@app/auth/skip-error-toast.context';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GroupStatusResponse } from '@app/models/group-orders/group-status.model';
import { OwnerSessionResponse } from '@app/models/group-orders/owner-session.model';
import {
  SubmitGroupPreOrderRequest,
  SubmittedDish,
} from '@app/models/group-orders/submit-group-pre-order.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { GuestInviteService } from '@app/services/reservation/guest-invite.service';

export interface GroupOrdersRequestOptions {
  silent?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class GroupOrdersService {
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly guestInviteService = inject(GuestInviteService);

  getInviteToken$(reservationId: string): Observable<{ token: string }> {
    return this.guestInviteService.getInviteToken$(reservationId);
  }

  getGroupInvite$(reservationId: string): Observable<GuestInvite> {
    return this.guestInviteService
      .getInviteToken$(reservationId)
      .pipe(switchMap(({ token }) => this.guestInviteService.getInvite$(token)));
  }

  getSessions$(
    groupReservationId: string,
    options: GroupOrdersRequestOptions = {}
  ): Observable<GroupSessionsResponse> {
    return this.http
      .get<{
        Participants?: Array<{
          Id: string;
          Type: Participant['type'];
          Name: string;
          Items: Participant['items'];
          Total: number;
          IsSubmitted: boolean;
        }>;
        Total?: number;
        participants?: Participant[];
        total?: number;
      }>(`${this.baseUrl}/guest/groups/${encodeURIComponent(groupReservationId)}/sessions`, {
        context: this.createContext(options),
      })
      .pipe(
        map((response) => ({
          participants:
            response.participants ??
            (response.Participants ?? []).map((participant) => ({
              id: participant.Id,
              type: participant.Type,
              name: participant.Name,
              items: participant.Items ?? [],
              total: participant.Total ?? 0,
              isSubmitted: participant.IsSubmitted ?? false,
            })),
          total: response.total ?? response.Total ?? 0,
        }))
      );
  }

  getOwnerSessionId$(reservationId: string): Observable<OwnerSessionResponse> {
    return this.http.get<OwnerSessionResponse>(
      `${this.baseUrl}/reservations/${encodeURIComponent(reservationId)}/guest-session-id`
    );
  }

  getStatus$(
    groupReservationId: string,
    options: GroupOrdersRequestOptions = {}
  ): Observable<GroupStatusResponse> {
    return this.http.get<GroupStatusResponse>(
      `${this.baseUrl}/guest/groups/${encodeURIComponent(groupReservationId)}/status`,
      { context: this.createContext(options) }
    );
  }

  submit$(groupReservationId: string, reservationId: string): Observable<SubmittedDish[]> {
    const body: SubmitGroupPreOrderRequest = { reservationId };

    return this.http.post<SubmittedDish[]>(
      `${this.baseUrl}/group-reservations/${encodeURIComponent(groupReservationId)}/submit`,
      body
    );
  }

  deleteGuestSession$(
    groupReservationId: string,
    guestSessionId: string
  ): Observable<GroupSessionsResponse> {
    return this.http.delete<GroupSessionsResponse>(
      `${this.baseUrl}/guest/groups/${encodeURIComponent(groupReservationId)}/sessions/${encodeURIComponent(guestSessionId)}`
    );
  }

  private createContext(options: GroupOrdersRequestOptions): HttpContext {
    return new HttpContext().set(SKIP_ERROR_TOAST, options.silent ?? false);
  }
}
