import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { SKIP_ERROR_TOAST } from '@app/auth/skip-error-toast.context';
import { GroupOrdersService } from './group-orders.service';

describe('GroupOrdersService', () => {
  let service: GroupOrdersService;
  let httpMock: HttpTestingController;

  const BASE_URL = 'https://test.api';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: BASE_URL },
      ],
    });

    service = TestBed.inject(GroupOrdersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('gets the invite token and then loads the group invite', () => {
    let result: unknown;

    service.getGroupInvite$('reservation-1').subscribe((invite) => {
      result = invite;
    });

    const tokenRequest = httpMock.expectOne(`${BASE_URL}/reservations/reservation-1/invite-token`);
    expect(tokenRequest.request.method).toBe('GET');
    tokenRequest.flush({ token: 'invite-token-1' });

    const inviteRequest = httpMock.expectOne(`${BASE_URL}/guest/invites/invite-token-1`);
    expect(inviteRequest.request.method).toBe('GET');

    const invite = {
      GroupReservationId: 'group-1',
      LocationId: 'location-1',
      RestaurantName: 'Green Tasty',
      LocationAddress: 'Test address',
      StartTime: '2026-11-01T12:00:00Z',
      EndTime: '2026-11-01T13:00:00Z',
      MaxGuestCount: 5,
      TableNumber: 10,
      InviterName: 'Owner',
    };

    inviteRequest.flush(invite);

    expect(result).toEqual(invite);
  });

  it('gets group sessions', () => {
    service.getSessions$('group-1').subscribe();

    const req = httpMock.expectOne(`${BASE_URL}/guest/groups/group-1/sessions`);

    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBeFalse();

    req.flush({ participants: [], total: 0 });
  });

  it('can skip the global error toast for background sessions requests', () => {
    service.getSessions$('group-1', { silent: true }).subscribe();

    const req = httpMock.expectOne(`${BASE_URL}/guest/groups/group-1/sessions`);

    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBeTrue();

    req.flush({ participants: [], total: 0 });
  });

  it('gets the owner guest session id', () => {
    service.getOwnerSessionId$('reservation-1').subscribe();

    const req = httpMock.expectOne(`${BASE_URL}/reservations/reservation-1/guest-session-id`);

    expect(req.request.method).toBe('GET');

    req.flush({ guestSessionId: 'owner-session-1' });
  });

  it('gets group reservation status', () => {
    service.getStatus$('group-1', { silent: true }).subscribe();

    const req = httpMock.expectOne(`${BASE_URL}/guest/groups/group-1/status`);

    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBeTrue();

    req.flush({
      currentParticipants: 2,
      maxCapacity: 5,
      status: 'Open',
    });
  });

  it('submits the group pre-order with the reservation id', () => {
    service.submit$('group-1', 'reservation-1').subscribe();

    const req = httpMock.expectOne(`${BASE_URL}/group-reservations/group-1/submit`);

    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      reservationId: 'reservation-1',
    });

    req.flush([]);
  });
});
