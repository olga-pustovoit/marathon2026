import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MakeReservationComponent } from './make-reservation.component';
import { Table } from '@app/models/tables/table.model';
import { TimeRange } from '@app/models/tables/time-range.model';

describe('MakeReservationComponent', () => {
  let component: MakeReservationComponent;
  let fixture: ComponentFixture<MakeReservationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MakeReservationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MakeReservationComponent);
    component = fixture.componentInstance;

    const timeRange: TimeRange = {
      start: '2026-11-03T15:00:00Z',
      end: '2026-11-03T16:30:00Z',
    };

    const table: Table = {
      id: 'test-table-id',
      tableNumber: 1,
      locationId: 'test-location-id',
      capacity: 4,
      timeRanges: [timeRange],
    };

    fixture.componentRef.setInput('table', table);
    fixture.componentRef.setInput('locationName', 'Test Restaurant');
    fixture.componentRef.setInput('selectedTimeRange', timeRange);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
