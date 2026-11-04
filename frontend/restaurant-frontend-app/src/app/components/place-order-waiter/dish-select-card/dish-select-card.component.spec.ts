import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';
import { DishSelectCardComponent } from './dish-select-card.component';

describe('DishSelectCardComponent', () => {
  let component: DishSelectCardComponent;
  let fixture: ComponentFixture<DishSelectCardComponent>;

  const dish: DishListResponse = {
    id: 'dish-1',
    name: 'Test Dish',
    imageUrl: '/assets/test-dish.jpg',
    price: 12.5,
    state: 'Available',
    weight: '300 g',
    dishType: 'Main',
    description: 'Test dish description',
    calories: '500',
    proteins: '25',
    carbohydrates: '40',
    fats: '20',
    vitamins: 'A, B',
    status: 'Confirmed',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DishSelectCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DishSelectCardComponent);
    component = fixture.componentInstance;
    component.dish = dish;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
