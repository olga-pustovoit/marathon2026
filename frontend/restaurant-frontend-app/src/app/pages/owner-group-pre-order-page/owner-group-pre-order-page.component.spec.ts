import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { Order } from '@app/models/orders/order.model';
import { OwnerGroupPreOrderPageComponent } from './owner-group-pre-order-page.component';

const INVITE = {
  GroupReservationId: 'group-1',
  LocationAddress: '1 Main Street',
  MaxGuestCount: 5,
  StartTime: '2026-11-05T16:00:00Z',
  EndTime: '2026-11-05T17:00:00Z',
} as GuestInvite;

const SESSIONS: GroupSessionsResponse = {
  participants: [
    {
      id: 'owner-session',
      type: 'Owner',
      name: 'Owner',
      items: [],
      total: 0,
      isSubmitted: false,
    },
    {
      id: 'guest-session',
      type: 'Guest',
      name: 'Guest',
      items: [
        {
          dish: { id: 'guest-dish', name: 'Guest Dish', price: 20 },
          quantity: 2,
        },
      ],
      total: 40,
      isSubmitted: true,
    },
  ],
  total: 40,
};

const ORDER: Order = {
  orderId: 'order-1',
  reservationId: 'reservation-1',
  reservationAddress: '1 Main Street',
  reservationTime: 'Nov 05, 2026',
  status: 0,
  orderItems: [
    {
      dish: {
        id: 'owner-dish',
        name: 'Owner Dish',
        price: 15,
        imageUrl: '',
        state: 'Available',
        weight: '',
        dishType: 'Main',
        description: '',
        calories: '',
        proteins: '',
        carbohydrates: '',
        fats: '',
        vitamins: '',
      },
      quantity: 2,
      state: 0,
    },
  ],
};

describe('OwnerGroupPreOrderPageComponent', () => {
  let service: jasmine.SpyObj<GroupOrdersService>;

  function create() {
    TestBed.configureTestingModule({
      imports: [OwnerGroupPreOrderPageComponent],
      providers: [
        { provide: GroupOrdersService, useValue: service },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ reservationId: 'reservation-1' }),
            },
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(OwnerGroupPreOrderPageComponent);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    service = jasmine.createSpyObj<GroupOrdersService>('GroupOrdersService', [
      'getInviteToken$',
      'getOwnerSessionId$',
      'getGroupInvite$',
      'getSessions$',
      'getStatus$',
      'getReservationOrder$',
      'submit$',
      'deleteGuestSession$',
      'removeParticipantDish$',
    ]);
    service.getInviteToken$.and.returnValue(of({ token: 'invite-token' }));
    service.getOwnerSessionId$.and.returnValue(of('owner-session'));
    service.getGroupInvite$.and.returnValue(of(INVITE));
    service.getSessions$.and.returnValue(of(structuredClone(SESSIONS)));
    service.getStatus$.and.returnValue(
      of({ currentParticipants: 2, maxCapacity: 5, status: 'Open' })
    );
    service.getReservationOrder$.and.returnValue(of(ORDER));
    service.submit$.and.returnValue(of([]));
    service.deleteGuestSession$.and.returnValue(of(SESSIONS));
    service.removeParticipantDish$.and.returnValue(of(undefined));
  });

  it('includes the reservation owner’s dishes in participant and group totals', () => {
    const { element } = create();

    expect(element.textContent).toContain('Owner Dish × 2');
    expect(element.textContent).toContain('Guest Dish × 2');
    expect(element.textContent).toContain('$70.00');
    expect(element.textContent).toContain('$30.00');
  });

  it('shows Submitted and Not submitted badges beside participant names', () => {
    const sessions = structuredClone(SESSIONS);
    sessions.participants[1].isSubmitted = false;
    service.getSessions$.and.returnValue(of(sessions));
    const { element } = create();
    const titles = [...element.querySelectorAll('.participant-title')];

    expect(titles[0].textContent).toContain('Submitted');
    expect(titles[1].textContent).toContain('Not submitted');
  });

  it('removes a dish using its participant session and dish IDs', () => {
    const { fixture, element } = create();
    element.querySelector<HTMLButtonElement>('[aria-label="Remove Owner Dish"]')!.click();
    fixture.detectChanges();

    expect(service.removeParticipantDish$).toHaveBeenCalledOnceWith(
      'group-1',
      'owner-session',
      'owner-dish'
    );
  });

  it('removes a guest after confirmation', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const { fixture, element } = create();
    element.querySelector<HTMLButtonElement>('[aria-label="Remove Guest"]')!.click();
    fixture.detectChanges();

    expect(service.deleteGuestSession$).toHaveBeenCalledOnceWith('group-1', 'guest-session');
    expect(element.textContent).toContain('Guest was removed from the group order.');
  });

  it('submits once, reports success, and disables the submit button', () => {
    const { fixture, element } = create();
    const submitButton = element.querySelector<HTMLButtonElement>('.submit-button')!;
    submitButton.click();
    fixture.detectChanges();

    expect(service.submit$).toHaveBeenCalledOnceWith('group-1', 'reservation-1');
    expect(element.textContent).toContain('Group pre-order submitted successfully.');
    expect(submitButton.disabled).toBeTrue();
    expect(submitButton.textContent).toContain('Submitted');
  });
});
