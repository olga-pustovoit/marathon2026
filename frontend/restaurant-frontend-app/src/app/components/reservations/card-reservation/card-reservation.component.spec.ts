import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CardReservationComponent } from './card-reservation.component';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { ReservationCustomer, ReservationStatusCustomer } from '@app/models/reservations/reservation.model';

describe('CardReservationComponent', () => {
  let component: CardReservationComponent;
  let fixture: ComponentFixture<CardReservationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [{ provide: API_BASE_URL, useValue: 'https://test.api' }],
      imports: [CardReservationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CardReservationComponent);
    component = fixture.componentInstance;

    const reservation: ReservationCustomer = {
      id: 'test-reservation-id',
      tableId: 'test-table-id',
      startTime: new Date('2026-11-03T15:00:00Z'),
      endTime: new Date('2026-11-03T16:30:00Z'),
      guestCount: 2,
      status: ReservationStatusCustomer.Reserved,
      restaurantName: 'Test Restaurant',
      locationAddress: 'Test Address',
      waiterId: 'test-waiter-id',
      customerId: 'test-customer-id',
    };

    fixture.componentRef.setInput('r', reservation);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
