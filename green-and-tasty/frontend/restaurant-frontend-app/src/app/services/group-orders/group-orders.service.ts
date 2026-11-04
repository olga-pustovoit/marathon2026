import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, switchMap } from 'rxjs';

import { SKIP_ERROR_TOAST } from '@app/auth/skip-error-toast.context';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GroupStatusResponse } from '@app/models/group-orders/group-status.model';
import {
  SubmitGroupPreOrderRequest,
  SubmittedDish,
} from '@app/models/group-orders/submit-group-pre-order.model';
import { Participant } from '@app/models/group-orders/participant.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { GuestInviteService } from '@app/services/reservation/guest-invite.service';

export interface GroupOrdersRequestOptions {
  silent?: boolean;
}

interface ApiParticipant {
  Id: string;
  Type: Participant['type'];
  Name: string;
  Items: Participant['items'];
  Total: number;
  IsSubmitted: boolean;
}

interface ApiGroupSessionsResponse {
  participants?: Participant[];
  total?: number;
  Participants?: ApiParticipant[];
  Total?: number;
}

@Injectable({
  providedIn: 'root',
})
export class GroupOrdersService {
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly inviteService = inject(GuestInviteService);

  getGroupInvite$(reservationId: string): Observable<GuestInvite> {
    return this.inviteService
      .getInviteToken$(reservationId)
      .pipe(switchMap(({ token }) => this.inviteService.getInvite$(token)));
  }

  getSessions$(
    groupReservationId: string,
    options: GroupOrdersRequestOptions = {}
  ): Observable<GroupSessionsResponse> {
    return this.http
      .get<ApiGroupSessionsResponse>(
        `${this.baseUrl}/guest/groups/${encodeURIComponent(groupReservationId)}/sessions`,
        { context: this.createContext(options) }
      )
      .pipe(map((response) => this.normalizeSessions(response)));
  }

  getOwnerSessionId$(reservationId: string): Observable<string> {
    return this.http
      .get<{
        guestSessionId: string;
      }>(`${this.baseUrl}/reservations/${encodeURIComponent(reservationId)}/guest-session-id`)
      .pipe(map((response) => response.guestSessionId));
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

  removeSession$(
    groupReservationId: string,
    guestSessionId: string
  ): Observable<GroupSessionsResponse> {
    return this.http
      .delete<ApiGroupSessionsResponse>(
        `${this.baseUrl}/guest/groups/${encodeURIComponent(groupReservationId)}/sessions/${encodeURIComponent(guestSessionId)}`
      )
      .pipe(map((response) => this.normalizeSessions(response)));
  }

  private createContext(options: GroupOrdersRequestOptions): HttpContext {
    return new HttpContext().set(SKIP_ERROR_TOAST, options.silent ?? false);
  }

  private normalizeSessions(response: ApiGroupSessionsResponse): GroupSessionsResponse {
    const participants =
      response.participants ??
      (response.Participants ?? []).map((participant) => ({
        id: participant.Id,
        type: participant.Type,
        name: participant.Name,
        items: participant.Items,
        total: participant.Total,
        isSubmitted: participant.IsSubmitted,
      }));

    return {
      participants,
      total:
        response.total ??
        response.Total ??
        participants.reduce((sum, participant) => sum + participant.total, 0),
    };
  }
}
